import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import type { MasterBook } from "@/lib/types";
import { toMediaUrl } from "@/lib/mediaUrl";
import { trpcBookToMasterBook } from "@/hooks/useBooks";

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
    translators: b.translator ? { name: b.translator.name } : null,
  }));

  return { books, loading: query.isLoading };
}

// Genuinely personalized — built server-side from the user's actual reading/listening
// progress and book-view history, never a generic popular-books stand-in. Gated to
// logged-in users only (query disabled for guests) and only returns data when the
// backend found at least 3 real related books; otherwise the section should hide.
export function useBecauseYouRead() {
  const { user } = useAuth();
  const query = trpc.books.becauseYouRead.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const data = query.data as { sourceBook: { id: string; title: string } | null; books: any[] } | undefined;

  const sourceBook = data?.sourceBook ?? null;
  const recommendations = (data?.books || []).map(trpcBookToMasterBook);

  return { sourceBook, recommendations, loading: query.isLoading };
}

export function useNewReleases(allBooks: MasterBook[]) {
  return allBooks.filter((b) => b.isNew).slice(0, 10);
}

// Queried directly (popularity-sorted, full catalog) rather than filtered out of a
// capped book list, so this matches the mobile REST popularAudiobooks section instead of
// silently dropping older popular audiobooks that fall outside a recency-capped window.
export function usePopularAudiobooks() {
  const { data } = trpc.books.browseBooks.useQuery(
    { format: "audiobook", sort: "popular", pageSize: 10 },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );
  return (data?.books || []).map(trpcBookToMasterBook);
}
