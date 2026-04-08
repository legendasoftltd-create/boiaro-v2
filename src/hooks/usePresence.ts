import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

  const doUpsert = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    lastUpsertTime.current = Date.now();
    const { page, bookId, type } = currentActivity.current;
    try {
      await supabase.from("user_presence" as any).upsert(
        {
          user_id: u.id,
          last_seen: new Date().toISOString(),
          current_page: page || window.location.pathname,
          current_book_id: bookId || null,
          activity_type: type,
          session_id: sessionStorage.getItem("presence_sid") || (() => {
            const sid = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            sessionStorage.setItem("presence_sid", sid);
            return sid;
          })(),
        },
        { onConflict: "user_id" } as any
      );
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

  const setActivity = useCallback((type: ActivityType, bookId?: string) => {
    currentActivity.current = { type, bookId, page: window.location.pathname };
    debouncedUpsert();
  }, [debouncedUpsert]);

  return { setActivity };
}
