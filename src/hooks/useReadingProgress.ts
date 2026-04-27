import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

interface ReadingProgressData {
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastReadAt: string | null;
  lastReadCfi: string | null;
}

export function useReadingProgress(bookId: string | undefined) {
  const { user } = useAuth();
  const [localProgress, setLocalProgress] = useState<ReadingProgressData | null>(null);

  const query = trpc.profiles.readingProgressByBook.useQuery(
    { bookId: bookId! },
    { enabled: !!user && !!bookId }
  );

  const updateMutation = trpc.profiles.updateReadingProgress.useMutation();

  useEffect(() => {
    const d = query.data as any;
    if (d) {
      setLocalProgress({
        currentPage: d.current_page || 0,
        totalPages: d.total_pages || 0,
        percentage: Number(d.percentage) || 0,
        lastReadAt: d.last_read_at || null,
        lastReadCfi: d.last_read_cfi || null,
      });
    }
  }, [query.data]);

  // percentageOverride: pass actual percentage directly (for EPUB where page numbers are unreliable)
  // cfi: EPUB content fragment identifier for exact position restore
  const saveProgress = useCallback(
    async (currentPage: number, totalPages: number, percentageOverride?: number, cfi?: string) => {
      if (!user || !bookId) return;
      const percentage = percentageOverride !== undefined
        ? Math.min(Math.round(percentageOverride), 100)
        : totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
      const clamped = Math.min(percentage, 100);

      setLocalProgress({
        currentPage,
        totalPages,
        percentage: clamped,
        lastReadAt: new Date().toISOString(),
        lastReadCfi: cfi ?? localProgress?.lastReadCfi ?? null,
      });

      try {
        await updateMutation.mutateAsync({
          bookId,
          currentPage,
          totalPages,
          percentage: clamped,
          cfi,
        });
      } catch {
        // Silent
      }
    },
    [user, bookId, updateMutation, localProgress?.lastReadCfi]
  );

  const loadProgress = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    progress: localProgress,
    loading: query.isLoading,
    saveProgress,
    loadProgress,
  };
}
