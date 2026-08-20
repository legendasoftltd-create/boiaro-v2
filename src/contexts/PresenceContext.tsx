import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Capacitor } from "@capacitor/core";

type ActivityType = "browsing" | "reading" | "listening";

const HEARTBEAT_INTERVAL = 45_000;
const BACKGROUND_HEARTBEAT_INTERVAL = 120_000;
const DEBOUNCE_MS = 5_000;

interface PresenceContextType {
  setActivity: (type: ActivityType, bookId?: string) => void;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

// Single app-wide heartbeat loop. Previously `usePresence()` was called
// independently from PresenceTracker, AudioPlayerContext, and EbookReader —
// each instance kept its own `currentActivity` ref and its own 45s interval,
// so all three raced to upsert the same `userPresence` row and whichever
// fired last won. Since PresenceTracker's and AudioPlayerContext's copies
// defaulted to (or resolved to) "browsing" whenever nothing was playing,
// they intermittently stomped a real "reading"/"listening" heartbeat back to
// "browsing" — undercounting the admin dashboard's Reading Now/Listening Now
// to near-zero even while Active Now (which just counts any presence row
// updated in the last 5 minutes) stayed accurate. One shared instance means
// there is only ever one activity value and one interval per user.
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentActivity = useRef<{ page?: string; bookId?: string; type: ActivityType }>({ type: "browsing" });
  const isVisible = useRef(true);
  const lastUpsertTime = useRef(0);
  const pendingUpsert = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const presenceMutation = trpc.profiles.presence.useMutation();
  const mutatePresenceRef = useRef(presenceMutation.mutateAsync);
  mutatePresenceRef.current = presenceMutation.mutateAsync;

  const doUpsert = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    lastUpsertTime.current = Date.now();
    const { page, bookId, type } = currentActivity.current;

    let sid = sessionStorage.getItem("presence_sid");
    if (!sid) {
      sid = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("presence_sid", sid);
    }

    try {
      await mutatePresenceRef.current({
        currentPage: page || window.location.pathname,
        currentBookId: bookId,
        activityType: type,
        sessionId: sid,
        platform: Capacitor.isNativePlatform() ? "mobile" : "web",
      });
    } catch {
      // Silently ignore
    }
  }, []);

  const debouncedUpsert = useCallback(() => {
    const elapsed = Date.now() - lastUpsertTime.current;
    if (elapsed >= DEBOUNCE_MS) {
      doUpsert();
    } else if (!pendingUpsert.current) {
      pendingUpsert.current = setTimeout(() => {
        pendingUpsert.current = null;
        doUpsert();
      }, DEBOUNCE_MS - elapsed);
    }
  }, [doUpsert]);

  const restartInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = isVisible.current ? HEARTBEAT_INTERVAL : BACKGROUND_HEARTBEAT_INTERVAL;
    intervalRef.current = setInterval(doUpsert, interval);
  }, [doUpsert]);

  useEffect(() => {
    if (!user) return;
    doUpsert();
    restartInterval();

    const handleVisibilityChange = () => {
      isVisible.current = !document.hidden;
      if (!document.hidden) doUpsert();
      restartInterval();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pendingUpsert.current) clearTimeout(pendingUpsert.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, doUpsert, restartInterval]);

  const setActivity = useCallback(
    (type: ActivityType, bookId?: string) => {
      currentActivity.current = { type, bookId, page: window.location.pathname };
      debouncedUpsert();
    },
    [debouncedUpsert]
  );

  return <PresenceContext.Provider value={{ setActivity }}>{children}</PresenceContext.Provider>;
}

export function usePresenceContext() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresenceContext must be used within a PresenceProvider");
  return ctx;
}
