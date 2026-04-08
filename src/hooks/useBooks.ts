import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MasterBook, Author, Publisher, Category } from "@/lib/types";

function dbToMasterBook(dbBook: any, formats: any[], narratorsMap: Record<string, any>): MasterBook {
  const author: Author = dbBook.authors ? {
    id: dbBook.author_id || "",
    name: dbBook.authors.name || "",
    nameEn: dbBook.authors.name_en || "",
    avatar: dbBook.authors.avatar_url || "",
    bio: dbBook.authors.bio || "",
    genre: dbBook.authors.genre || "",
    booksCount: 0,
    followers: "0",
    isFeatured: dbBook.authors.is_featured || false,
  } : { id: "", name: "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false };

  const publisher: Publisher = dbBook.publishers ? {
    id: dbBook.publisher_id || "",
    name: dbBook.publishers.name || "",
    nameEn: dbBook.publishers.name_en || "",
    logo: dbBook.publishers.logo_url || "",
    description: dbBook.publishers.description || "",
    booksCount: 0,
    isVerified: dbBook.publishers.is_verified || false,
  } : { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false };

  const category: Category = dbBook.categories ? {
    id: dbBook.category_id || "",
    name: dbBook.categories.name || "",
    nameBn: dbBook.categories.name_bn || "",
    icon: dbBook.categories.icon || "BookOpen",
    count: "0",
    color: dbBook.categories.color || "primary",
  } : { id: "", name: "", nameBn: "", icon: "BookOpen", count: "0", color: "primary" };

  const bookFormats: MasterBook["formats"] = {};

  for (const f of formats) {
    if (f.format === "ebook") {
      bookFormats.ebook = {
        available: f.is_available !== false,
        price: Number(f.price) || 0,
        pages: f.pages || 0,
        fileSize: f.file_size || "",
        previewChapters: f.preview_chapters || undefined,
      };
    } else if (f.format === "audiobook") {
      const narrator = f.narrator_id && narratorsMap[f.narrator_id];
      bookFormats.audiobook = {
        available: f.is_available !== false,
        price: Number(f.price) || 0,
        duration: f.duration || "",
        narrator: narrator ? {
          id: narrator.id,
          name: narrator.name,
          nameEn: narrator.name_en || "",
          avatar: narrator.avatar_url || "",
          bio: narrator.bio || "",
          specialty: narrator.specialty || "",
          audiobooksCount: 0,
          listeners: "0",
          rating: Number(narrator.rating) || 0,
          isFeatured: narrator.is_featured || false,
        } : { id: "", name: "", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
        chapters: f.chapters_count || 0,
        quality: f.audio_quality || "standard",
      };
    } else if (f.format === "hardcopy") {
      bookFormats.hardcopy = {
        available: f.is_available !== false && f.in_stock !== false,
        price: Number(f.price) || 0,
        originalPrice: f.original_price ? Number(f.original_price) : undefined,
        discount: f.discount || undefined,
        pages: f.pages || 0,
        binding: f.binding || "paperback",
        weight: f.weight || "",
        dimensions: f.dimensions || "",
        inStock: f.in_stock !== false,
        stockCount: f.stock_count || 0,
        deliveryDays: f.delivery_days || 3,
      };
    }
  }

  return {
    id: dbBook.id,
    title: dbBook.title,
    titleEn: dbBook.title_en || "",
    slug: dbBook.slug,
    author,
    publisher,
    category,
    cover: dbBook.cover_url || "",
    description: dbBook.description || "",
    descriptionBn: dbBook.description_bn || dbBook.description || "",
    rating: Number(dbBook.rating) || 0,
    reviewsCount: dbBook.reviews_count || 0,
    totalReads: String(dbBook.total_reads || 0),
    publishedDate: dbBook.published_date || "",
    language: dbBook.language || "bn",
    tags: dbBook.tags || [],
    isFeatured: dbBook.is_featured || false,
    isNew: dbBook.is_new || false,
    isBestseller: dbBook.is_bestseller || false,
    isFree: dbBook.is_free || false,
    formats: bookFormats,
  };
}

/**
 * Fetch books with optional limit. Homepage uses 200, browse uses pagination.
 */
async function fetchBooks(limit?: number): Promise<MasterBook[]> {
  const SAFE_AUTHORS = "id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id, created_at, updated_at";
  const SAFE_PUBLISHERS = "id, name, name_en, logo_url, description, is_verified, is_featured, is_trending, priority, status, user_id, created_at, updated_at";
  let booksQuery = supabase.from("books").select(`*, authors(${SAFE_AUTHORS}), publishers(${SAFE_PUBLISHERS}), categories(*)`)
    .eq("submission_status", "approved")
    .order("created_at", { ascending: false });

  if (limit) booksQuery = booksQuery.limit(limit);

  const [booksRes, formatsRes, narratorsRes] = await Promise.all([
    booksQuery,
    supabase.from("book_formats").select("id, book_id, format, price, original_price, discount, pages, duration, file_size, chapters_count, preview_chapters, preview_percentage, audio_quality, binding, dimensions, weight, delivery_days, in_stock, stock_count, is_available, narrator_id, submission_status, printing_cost, unit_cost, submitted_by, created_at, updated_at"),
    supabase.from("narrators").select("id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending, priority, status, user_id, created_at, updated_at"),
  ]);

  const dbBooks = booksRes.data || [];
  const allFormats = formatsRes.data || [];
  const narratorsMap: Record<string, any> = {};
  (narratorsRes.data || []).forEach(n => { narratorsMap[n.id] = n; });

  if (dbBooks.length > 0) {
    const bookIds = new Set(dbBooks.map(b => b.id));
    const formatsByBook: Record<string, any[]> = {};
    allFormats.forEach(f => {
      if (bookIds.has(f.book_id)) {
        if (!formatsByBook[f.book_id]) formatsByBook[f.book_id] = [];
        formatsByBook[f.book_id].push(f);
      }
    });
    return dbBooks.map(b => dbToMasterBook(b, formatsByBook[b.id] || [], narratorsMap));
  }
  return [];
}

/** Homepage limit — fetch top 200 books only */
const HOMEPAGE_LIMIT = 200;

/** Single cached query for homepage — limited to 200 books */
export function useBooks() {
  const { data: books = [], isLoading: loading } = useQuery<MasterBook[]>({
    queryKey: ["all-books", HOMEPAGE_LIMIT],
    queryFn: () => fetchBooks(HOMEPAGE_LIMIT),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch trending period from site settings + activity-based trending book IDs
  const { data: trendingBookIds = [] } = useQuery<string[]>({
    queryKey: ["trending-book-ids"],
    queryFn: async () => {
      // Get trending period from platform_settings
      const { data: settingsData } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "rec_trending_period_days")
        .maybeSingle();
      const periodDays = parseInt((settingsData as any)?.value || "7") || 7;
      const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

      // Get activity counts per book in the period
      const { data: activityData } = await supabase
        .from("user_activity_logs")
        .select("book_id")
        .in("event_type", ["book_view", "book_read", "book_purchase"])
        .gte("created_at", since)
        .not("book_id", "is", null);

      if (!activityData || activityData.length === 0) return [];

      // Score: count occurrences per book
      const scores: Record<string, number> = {};
      activityData.forEach((row: any) => {
        if (row.book_id) scores[row.book_id] = (scores[row.book_id] || 0) + 1;
      });

      return Object.entries(scores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([id]) => id);
    },
    staleTime: 5 * 60 * 1000,
  });

  const newReleases = useMemo(() => books.filter(b => b.isNew), [books]);
  const featured = useMemo(() => books.filter(b => b.isFeatured), [books]);
  const trending = useMemo(() => {
    if (trendingBookIds.length > 0) {
      // Activity-based trending: order books by their trending rank
      const idOrder = new Map(trendingBookIds.map((id, i) => [id, i]));
      return books
        .filter(b => idOrder.has(b.id))
        .sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99));
    }
    // Fallback: sort by totalReads if no activity data
    return [...books].sort((a, b) =>
      parseInt(String(b.totalReads).replace(/K/g, "000")) - parseInt(String(a.totalReads).replace(/K/g, "000"))
    ).slice(0, 8);
  }, [books, trendingBookIds]);
  const audiobooks = useMemo(() => books.filter(b => b.formats.audiobook?.available).slice(0, 8), [books]);
  const hardcopies = useMemo(() => books.filter(b => b.formats.hardcopy?.available).slice(0, 8), [books]);
  const freeBooks = useMemo(() => books.filter(b => b.isFree), [books]);
  const editorsPick = featured[0] || books[0] || null;

  return { books, loading, newReleases, featured, trending, audiobooks, hardcopies, freeBooks, editorsPick };
}

/*─────────────────────────────────────────────────────────────
  Server-side paginated browse — used by BooksPage
─────────────────────────────────────────────────────────────*/
const PAGE_SIZE = 30;

interface BrowseFilters {
  format?: string | null;
  filter?: string | null;
  categoryId?: string | null;
  query?: string | null;
  sort?: string | null;
}

async function fetchBrowsePage(
  page: number,
  filters: BrowseFilters,
): Promise<{ books: MasterBook[]; total: number }> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Base query with count
  const SAFE_AUTHORS = "id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id, created_at, updated_at";
  const SAFE_PUBLISHERS = "id, name, name_en, logo_url, description, is_verified, is_featured, is_trending, priority, status, user_id, created_at, updated_at";
  let q = supabase.from("books")
    .select(`*, authors(${SAFE_AUTHORS}), publishers(${SAFE_PUBLISHERS}), categories(*)`, { count: "exact" })
    .eq("submission_status", "approved");

  // Format filter: pre-filter book IDs server-side so pagination works correctly
  if (filters.format) {
    const { data: formatBookIds } = await supabase
      .from("book_formats_public")
      .select("book_id")
      .eq("format", filters.format as "ebook" | "audiobook" | "hardcopy")
      .eq("is_available", true)
      .eq("submission_status", "approved");
    const ids = (formatBookIds || []).map(f => f.book_id);
    if (ids.length === 0) return { books: [], total: 0 };
    q = q.in("id", ids);
  }

  // Category
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
  // Status filters
  if (filters.filter === "free") q = q.eq("is_free", true);
  if (filters.filter === "new") q = q.eq("is_new", true);
  if (filters.filter === "bestseller") q = q.eq("is_bestseller", true);
  if (filters.filter === "trending") q = q.or("is_bestseller.eq.true,is_featured.eq.true");
  // Search
  if (filters.query) q = q.or(`title.ilike.%${filters.query}%,title_en.ilike.%${filters.query}%`);
  // Sort
  if (filters.sort === "newest") q = q.order("published_date", { ascending: false, nullsFirst: false });
  else if (filters.sort === "rating") q = q.order("rating", { ascending: false });
  else if (filters.sort === "popular") q = q.order("total_reads", { ascending: false });
  else q = q.order("created_at", { ascending: false });

  q = q.range(from, to);

  const [booksRes, formatsRes, narratorsRes] = await Promise.all([
    q,
    supabase.from("book_formats").select("id, book_id, format, price, original_price, discount, pages, duration, file_size, chapters_count, preview_chapters, preview_percentage, audio_quality, binding, dimensions, weight, delivery_days, in_stock, stock_count, is_available, narrator_id, submission_status, printing_cost, unit_cost, submitted_by, created_at, updated_at"),
    supabase.from("narrators").select("id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending, priority, status, user_id, created_at, updated_at"),
  ]);

  const dbBooks = booksRes.data || [];
  const total = booksRes.count || 0;
  const allFormats = formatsRes.data || [];
  const narratorsMap: Record<string, any> = {};
  (narratorsRes.data || []).forEach(n => { narratorsMap[n.id] = n; });

  if (dbBooks.length === 0) {
    return { books: [], total: 0 };
  }

  const bookIds = new Set(dbBooks.map(b => b.id));
  const formatsByBook: Record<string, any[]> = {};
  allFormats.forEach(f => {
    if (bookIds.has(f.book_id)) {
      if (!formatsByBook[f.book_id]) formatsByBook[f.book_id] = [];
      formatsByBook[f.book_id].push(f);
    }
  });

  const mapped = dbBooks.map(b => dbToMasterBook(b, formatsByBook[b.id] || [], narratorsMap));

  return { books: mapped, total };
}

export function useBrowseBooks(filters: BrowseFilters) {
  const [page, setPage] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const prevFiltersKey = useRef(filtersKey);

  // Reset to page 0 when filters change
  useEffect(() => {
    if (prevFiltersKey.current !== filtersKey) {
      prevFiltersKey.current = filtersKey;
      setPage(0);
    }
  }, [filtersKey]);

  const queryKey = ["browse-books", page, filters.format, filters.filter, filters.categoryId, filters.query, filters.sort];

  const { data, isLoading: loading } = useQuery<{ books: MasterBook[]; total: number }>({
    queryKey,
    queryFn: () => fetchBrowsePage(page, filters),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev, // keep previous data while loading
  });

  const books = data?.books || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasMore = page < totalPages - 1;

  return {
    books,
    loading,
    total,
    page,
    totalPages,
    hasMore,
    setPage,
    nextPage: () => setPage(p => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage(p => Math.max(p - 1, 0)),
    PAGE_SIZE,
  };
}

export function useAuthors() {
  const { data: authors = [] } = useQuery({
    queryKey: ["all-authors"],
    queryFn: async () => {
      const [authorsRes, booksRes, followsRes] = await Promise.all([
        supabase.from("authors").select("id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id, created_at, updated_at").eq("status", "active")
          .order("priority", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase.from("books").select("author_id").eq("submission_status", "approved"),
        supabase.from("follows").select("profile_id").eq("profile_type", "author"),
      ]);

      const data = authorsRes.data;
      if (data && data.length > 0) {
        // Count approved books per author
        const bookCounts: Record<string, number> = {};
        (booksRes.data || []).forEach(b => {
          if (b.author_id) bookCounts[b.author_id] = (bookCounts[b.author_id] || 0) + 1;
        });
        // Count followers per author
        const followerCounts: Record<string, number> = {};
        (followsRes.data || []).forEach(f => {
          followerCounts[f.profile_id] = (followerCounts[f.profile_id] || 0) + 1;
        });

        return data.map(a => ({
          id: a.id, name: a.name, nameEn: a.name_en || "",
          avatar: a.avatar_url || "", bio: a.bio || "",
          genre: a.genre || "",
          booksCount: bookCounts[a.id] || 0,
          followers: String(followerCounts[a.id] || 0),
          isFeatured: a.is_featured || false,
        }));
      }
      return [];
    },
    staleTime: 5 * 60 * 1000,
  });
  return authors;
}

export function useNarrators() {
  const { data: narrs = [] } = useQuery({
    queryKey: ["all-narrators"],
    queryFn: async () => {
      const [narratorsRes, formatsRes, followsRes] = await Promise.all([
        supabase.from("narrators").select("id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending, priority, status, user_id, created_at, updated_at").eq("status", "active")
          .order("priority", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase.from("book_formats").select("narrator_id")
          .eq("format", "audiobook").eq("is_available", true).eq("submission_status", "approved"),
        supabase.from("follows").select("profile_id").eq("profile_type", "narrator"),
      ]);

      const data = narratorsRes.data;
      if (data && data.length > 0) {
        // Count approved audiobooks per narrator
        const abCounts: Record<string, number> = {};
        (formatsRes.data || []).forEach(f => {
          if (f.narrator_id) abCounts[f.narrator_id] = (abCounts[f.narrator_id] || 0) + 1;
        });
        // Count followers per narrator
        const followerCounts: Record<string, number> = {};
        (followsRes.data || []).forEach(f => {
          followerCounts[f.profile_id] = (followerCounts[f.profile_id] || 0) + 1;
        });

        return data.map(n => ({
          id: n.id, name: n.name, nameEn: n.name_en || "",
          avatar: n.avatar_url || "", bio: n.bio || "",
          specialty: n.specialty || "",
          audiobooksCount: abCounts[n.id] || 0,
          listeners: String(followerCounts[n.id] || 0),
          rating: Number(n.rating) || 0, isFeatured: n.is_featured || false,
        }));
      }
      return [];
    },
    staleTime: 5 * 60 * 1000,
  });
  return narrs;
}

export function useCategories() {
  const { data: cats = [] } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("status", "active")
        .order("priority", { ascending: true })
        .order("name");
      if (data && data.length > 0) {
        return data.map(c => ({
          id: c.id, name: c.name, nameBn: c.name_bn || c.name,
          icon: c.icon || "BookOpen", count: "0", color: c.color || "primary",
        }));
      }
      return [];
    },
    staleTime: 5 * 60 * 1000,
  });
  return cats;
}
