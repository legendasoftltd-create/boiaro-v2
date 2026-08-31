import { useCallback, useEffect, useRef } from "react";

/**
 * Holds a Screen Wake Lock while a broadcast is running.
 *
 * On a phone this is the difference between a show that stays up and one that
 * dies a few minutes in: when the screen sleeps, the browser throttles timers
 * and suspends audio, the RJ client stops sending its ~20s heartbeat, and the
 * server's watchdog moves the session to "reconnecting" and then ends it with
 * disconnect_reason "heartbeat_timeout". That is exactly the shape of the
 * short, repeatedly-restarted sessions seen in production.
 *
 * The lock is released by the browser whenever the page is hidden, so it has
 * to be re-acquired on visibilitychange rather than taken once.
 *
 * Unsupported browsers (notably older iOS Safari) simply get no lock — the
 * caller still works, it just can't stop the screen sleeping there, which is
 * why the UI also tells a mobile RJ to keep the screen on.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<any>(null);
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  const acquire = useCallback(async () => {
    if (!supported || sentinelRef.current) return;
    try {
      const sentinel = await (navigator as any).wakeLock.request("screen");
      sentinelRef.current = sentinel;
      sentinel.addEventListener?.("release", () => { sentinelRef.current = null; });
    } catch {
      // Denied (battery saver, no user gesture yet) — not fatal.
      sentinelRef.current = null;
    }
  }, [supported]);

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    try { await sentinel?.release?.(); } catch { /* already gone */ }
  }, []);

  useEffect(() => {
    if (!active) { void release(); return; }
    void acquire();

    // The browser drops the lock when the tab is hidden; take it again on return.
    const onVisibility = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [active, acquire, release]);

  return { supported };
}
