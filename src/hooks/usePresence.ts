import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

type ActivityType = "browsing" | "reading" | "listening";

const HEARTBEAT_INTERVAL = 45_000;
const BACKGROUND_HEARTBEAT_INTERVAL = 120_000;
const DEBOUNCE_MS = 5_000;

export function usePresence() {
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

  return { setActivity };
}
