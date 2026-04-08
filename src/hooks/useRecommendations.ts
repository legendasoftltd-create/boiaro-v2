import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { MasterBook } from "@/lib/types";

interface RecentlyViewedBook {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  rating: number | null;
  category_id: string | null;
  author_id: string | null;
  authors: { name: string } | null;
}

export function useRecentlyViewed() {
  const { user } = useAuth();
  const [books, setBooks] = useState<RecentlyViewedBook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const fetch = async () => {
      const { data } = await supabase
        .from("user_activity_logs")
        .select("book_id, created_at")
        .eq("user_id", user.id)
        .eq("event_type", "book_view")
        .not("book_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!data || data.length === 0) { setLoading(false); return; }

      // Deduplicate by book_id, keep most recent
      const seen = new Set<string>();
      const uniqueIds: string[] = [];
      for (const row of data) {
        if (row.book_id && !seen.has(row.book_id)) {
          seen.add(row.book_id);
          uniqueIds.push(row.book_id);
        }
      }

      if (uniqueIds.length === 0) { setLoading(false); return; }

      const { data: booksData } = await supabase
        .from("books")
        .select("id, title, slug, cover_url, rating, category_id, author_id, authors(name)")
        .in("id", uniqueIds.slice(0, 12))
        .eq("submission_status", "approved");

      if (booksData) {
        // Maintain order from activity logs
        const bookMap = new Map(booksData.map(b => [b.id, b]));
        const ordered = uniqueIds
          .map(id => bookMap.get(id))
          .filter(Boolean) as RecentlyViewedBook[];
        setBooks(ordered);
      }
      setLoading(false);
    };

    fetch();
  }, [user]);

  return { books, loading };
}

export function useBecauseYouRead(allBooks: MasterBook[]) {
  const { user } = useAuth();
  const [sourceBook, setSourceBook] = useState<{ title: string; categoryId: string; authorId: string } | null>(null);
  const [recommendations, setRecommendations] = useState<MasterBook[]>([]);

  useEffect(() => {
    if (!user || allBooks.length === 0) return;

    const fetch = async () => {
      // Get most recent book view with metadata
      const { data } = await supabase
        .from("user_activity_logs")
        .select("book_id, metadata")
        .eq("user_id", user.id)
        .eq("event_type", "book_view")
        .not("book_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!data || data.length === 0) return;

      // Find the first viewed book that exists in allBooks
      for (const row of data) {
        const viewedBook = allBooks.find(b => b.id === row.book_id);
        if (viewedBook && viewedBook.category.id) {
          setSourceBook({
            title: viewedBook.title,
            categoryId: viewedBook.category.id,
            authorId: viewedBook.author.id,
          });

          // Get books in same category or by same author, excluding the source
          const related = allBooks.filter(b =>
            b.id !== viewedBook.id &&
            (b.category.id === viewedBook.category.id || b.author.id === viewedBook.author.id)
          ).slice(0, 10);

          setRecommendations(related);
          break;
        }
      }
    };

    fetch();
  }, [user, allBooks.length]);

  return { sourceBook, recommendations };
}

export function useNewReleases(allBooks: MasterBook[]) {
  return allBooks
    .filter(b => b.isNew)
    .slice(0, 10);
}

export function usePopularAudiobooks(allBooks: MasterBook[]) {
  return allBooks
    .filter(b => b.formats.audiobook?.available)
    .sort((a, b) => parseInt(String(b.totalReads).replace(/K/g, "000")) - parseInt(String(a.totalReads).replace(/K/g, "000")))
    .slice(0, 10);
}
