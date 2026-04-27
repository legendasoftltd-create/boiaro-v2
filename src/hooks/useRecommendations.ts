import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import type { MasterBook } from "@/lib/types";
import { toMediaUrl } from "@/lib/mediaUrl";

export function useRecentlyViewed() {
  const { user } = useAuth();
  const query = trpc.books.recentlyViewed.useQuery(
    { limit: 12 },
    { enabled: !!user }
  );

  const books = ((query.data as any[]) || []).map((b: any) => ({
    id: b.id,
    title: b.title,
    slug: b.slug,
    cover_url: toMediaUrl(b.cover_url),
    rating: b.rating,
    category_id: b.category_id,
    author_id: b.author_id,
    authors: b.author ? { name: b.author.name } : null,
  }));

  return { books, loading: query.isLoading };
}

export function useBecauseYouRead(allBooks: MasterBook[]) {
  const query = trpc.books.recommendations.useQuery();
  const recBooks = (query.data as any[]) || [];

  const sourceBook = recBooks.length > 0
    ? { title: recBooks[0]?.title || "", categoryId: recBooks[0]?.category_id || "", authorId: recBooks[0]?.author_id || "" }
    : null;

  const recommendations = recBooks
    .map((b: any) => allBooks.find((ab) => ab.id === b.id))
    .filter(Boolean) as MasterBook[];

  return { sourceBook, recommendations };
}

export function useNewReleases(allBooks: MasterBook[]) {
  return allBooks.filter((b) => b.isNew).slice(0, 10);
}

export function usePopularAudiobooks(allBooks: MasterBook[]) {
  return allBooks
    .filter((b) => b.formats.audiobook?.available)
    .sort((a, b) =>
      parseInt(String(b.totalReads).replace(/K/g, "000")) -
      parseInt(String(a.totalReads).replace(/K/g, "000"))
    )
    .slice(0, 10);
}
