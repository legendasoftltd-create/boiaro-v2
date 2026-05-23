import { trpc } from "@/lib/trpc";

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K+";
  return String(n);
}

export function usePlatformStats() {
  const { data, isLoading } = trpc.books.platformStats.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const stats = {
    ebooks: data?.ebooks ?? 0,
    audiobooks: data?.audiobooks ?? 0,
    hardcopies: data?.hardcopies ?? 0,
    narrators: data?.narrators ?? 0,
  };

  return { stats, loading: isLoading, formatCount };
}
