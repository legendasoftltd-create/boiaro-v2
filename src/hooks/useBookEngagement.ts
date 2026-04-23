import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export function useBookEngagement(bookId: string) {
  const { user } = useAuth();
  const trackedKey = useRef<string | null>(null);
  const [liveReads, setLiveReads] = useState<number | null>(null);
  const [liveRating, setLiveRating] = useState<number | null>(null);
  const [liveReviewsCount, setLiveReviewsCount] = useState<number | null>(null);

  const incrementReadMutation = trpc.books.incrementRead.useMutation({
    onSuccess: (data: any) => {
      if (typeof data?.reads_count === "number") setLiveReads(data.reads_count);
    },
  });

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

  const trackRead = useCallback(async () => {
    if (!user || !bookId) return;

    const key = `read_${bookId}_${user.id}`;
    if (trackedKey.current === key) return;
    trackedKey.current = key;

    const lastRead = localStorage.getItem(key);
    const now = Date.now();
    if (lastRead && now - Number(lastRead) < 3600000) return;

    localStorage.setItem(key, String(now));

    try {
      await incrementReadMutation.mutateAsync({ bookId });
    } catch {
      // Silent
    }
  }, [user, bookId, incrementReadMutation]);

  const refreshReviewStats = useCallback(async () => {
    await bookQuery.refetch();
  }, [bookQuery]);

  return {
    liveReads,
    liveRating,
    liveReviewsCount,
    trackRead,
    refreshReviewStats,
  };
}
