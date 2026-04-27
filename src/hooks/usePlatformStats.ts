import { useMemo } from "react";
import { useBooks, useNarrators } from "@/hooks/useBooks";
import { useAuth } from "@/contexts/AuthContext";

interface PlatformStats {
  ebooks: number;
  audiobooks: number;
  hardcopies: number;
  narrators: number;
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K+";
  return String(n);
}

/** Derive platform stats from books data + narrators table for accurate counts */
export function usePlatformStats() {
  const { user, loading: authLoading } = useAuth();
  const { books, loading } = useBooks();
  const narrators = useNarrators();

  const stats = useMemo<PlatformStats>(() => {
    // Not logged in → all zeros
    if (!user) {
      return { ebooks: 0, audiobooks: 0, hardcopies: 0, narrators: 0 };
    }

    let ebooks = 0;
    let audiobooks = 0;
    let hardcopies = 0;

    for (const b of books) {
      if (b.formats.ebook?.available) ebooks++;
      if (b.formats.audiobook?.available) audiobooks++;
      if (b.formats.hardcopy?.available) hardcopies++;
    }

    return { ebooks, audiobooks, hardcopies, narrators: narrators.length };
  }, [user, books, narrators]);

  return { stats, loading: loading || authLoading, formatCount };
}
