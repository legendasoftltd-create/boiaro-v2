import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { getOrCreateDeviceId } from "@/lib/deviceId";

export function useBookEngagement(bookId: string) {
  const { user } = useAuth();
  const trackedKey = useRef<string | null>(null);
  const [liveReads, setLiveReads] = useState<number | null>(null);
  const [liveRating, setLiveRating] = useState<number | null>(null);
  const [liveReviewsCount, setLiveReviewsCount] = useState<number | null>(null);

  const recordViewMutation = trpc.books.recordView.useMutation();

  const bookQuery = trpc.books.byId.useQuery(
    { id: bookId },
    {
      enabled: !!bookId,
      onSuccess: (data: any) => {
        if (data) {
          setLiveReads(data.total_reads ?? null);
          setLiveRating(data.rating ?? null);
          setLiveReviewsCount(data.reviews_count ?? null);
        }
      },
    } as any
  );

  // Book Details page view — actual read engagement is tracked separately,
  // inside the reader (see useReadingProgress). The server dedups this to at
  // most once per 24h per user/device, so this is safe to call on every mount.
  const trackView = useCallback(async () => {
    if (!bookId) return;

    const key = `view_${bookId}_${user?.id ?? "anon"}`;
    if (trackedKey.current === key) return;
    trackedKey.current = key;

    try {
      const deviceId = user ? undefined : await getOrCreateDeviceId();
      await recordViewMutation.mutateAsync({ bookId, deviceId });
    } catch {
      // Silent
    }
  }, [user, bookId, recordViewMutation]);

  const refreshReviewStats = useCallback(async () => {
    await bookQuery.refetch();
  }, [bookQuery]);

  return {
    liveReads,
    liveRating,
    liveReviewsCount,
    trackView,
    refreshReviewStats,
  };
}
