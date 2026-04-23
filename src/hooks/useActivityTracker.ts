import { useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

type EventType =
  | "book_view"
  | "search"
  | "click"
  | "category_click"
  | "reading_progress"
  | "listening_progress"
  | "bookmark"
  | "purchase"
  | "unlock"
  | "session_start"
  | "tts_session"
  | "tts_mode_switch"
  | "tts_preview";

interface TrackOptions {
  bookId?: string;
  metadata?: Record<string, any>;
}

let sessionId: string | null = null;
function getSessionId() {
  if (!sessionId) {
    sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  return sessionId;
}

export function useActivityTracker() {
  const { user } = useAuth();
  const debounceRef = useRef<Record<string, number>>({});
  const logActivity = trpc.gamification.logActivity.useMutation();

  const track = useCallback(
    async (eventType: EventType, options?: TrackOptions) => {
      if (!user) return;

      const key = `${eventType}-${options?.bookId || ""}`;
      const now = Date.now();
      if (debounceRef.current[key] && now - debounceRef.current[key] < 2000) return;
      debounceRef.current[key] = now;

      try {
        await logActivity.mutateAsync({
          action: eventType,
          activityType: eventType,
          bookId: options?.bookId,
          metadata: { ...options?.metadata, session_id: getSessionId() },
        });
      } catch {
        // Silent fail — don't break UX for tracking
      }
    },
    [user, logActivity]
  );

  const trackBookView = useCallback(
    (bookId: string, title?: string) => track("book_view", { bookId, metadata: { title } }),
    [track]
  );

  const trackSearch = useCallback(
    (query: string, resultsCount?: number) =>
      track("search", { metadata: { query, results_count: resultsCount } }),
    [track]
  );

  const trackReadingProgress = useCallback(
    (bookId: string, percentage: number) =>
      track("reading_progress", { bookId, metadata: { percentage } }),
    [track]
  );

  const trackListeningProgress = useCallback(
    (bookId: string, durationSeconds: number, percentage: number) =>
      track("listening_progress", { bookId, metadata: { duration_seconds: durationSeconds, percentage } }),
    [track]
  );

  const trackCategoryClick = useCallback(
    (categoryId: string, categoryName?: string) =>
      track("category_click", { metadata: { category_id: categoryId, category_name: categoryName } }),
    [track]
  );

  const trackUnlock = useCallback(
    (bookId: string, format: string, coinsSpent?: number) =>
      track("unlock", { bookId, metadata: { format, coins_spent: coinsSpent } }),
    [track]
  );

  const trackTtsSession = useCallback(
    (bookId: string, mode: "browser" | "premium", durationSeconds: number) =>
      track("tts_session", { bookId, metadata: { mode, duration_seconds: durationSeconds } }),
    [track]
  );

  const trackTtsModeSwitch = useCallback(
    (bookId: string, fromMode: string, toMode: string) =>
      track("tts_mode_switch", { bookId, metadata: { from: fromMode, to: toMode } }),
    [track]
  );

  const trackTtsPreview = useCallback(
    (mode: "browser" | "premium") => track("tts_preview", { metadata: { mode } }),
    [track]
  );

  return { track, trackBookView, trackSearch, trackReadingProgress, trackListeningProgress, trackCategoryClick, trackUnlock, trackTtsSession, trackTtsModeSwitch, trackTtsPreview };
}
