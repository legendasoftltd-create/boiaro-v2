import { useMemo, useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import type { MasterBook, Author, Publisher, Category } from "@/lib/types";
import { toMediaUrl } from "@/lib/mediaUrl";
import { formatDuration } from "@/lib/duration";
import { stripHtml } from "@/lib/stripHtml";

export function trpcBookToMasterBook(book: any): MasterBook {
  const author: Author = book.author
    ? {
        id: book.author.id,
        name: book.author.name,
        nameEn: book.author.name_en || "",
        avatar: toMediaUrl(book.author.avatar_url) || "",
        bio: book.author.bio || "",
        genre: book.author.genre || "",
        booksCount: 0,
        followers: "0",
        isFeatured: book.author.is_featured || false,
      }
    : { id: "", name: "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false };

  const translator: Author = book.translator
    ? {
        id: book.translator.id,
        name: book.translator.name,
        nameEn: book.translator.name_en || "",
        avatar: toMediaUrl(book.translator.avatar_url) || "",
        bio: book.translator.bio || "",
        genre: book.translator.genre || "",
        booksCount: 0,
        followers: "0",
        isFeatured: book.translator.is_featured || false,
      }
    : { id: "", name: "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false };

  const publisher: Publisher = book.publisher
    ? {
        id: book.publisher.id,
        name: book.publisher.name,
        nameEn: book.publisher.name_en || "",
        logo: toMediaUrl(book.publisher.logo_url) || "",
        description: book.publisher.description || "",
        booksCount: 0,
        isVerified: book.publisher.is_verified || false,
      }
    : { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false };

  const category: Category = book.category
    ? {
        id: book.category.id,
        name: book.category.name,
        nameBn: book.category.name_bn || book.category.name,
        icon: toMediaUrl(book.category.icon) || "BookOpen",
        count: "0",
        color: book.category.color || "primary",
      }
    : { id: "", name: "", nameBn: "", icon: "BookOpen", count: "0", color: "primary" };

  const formats: MasterBook["formats"] = {};
  const selectedByType: Record<string, any> = {};
  for (const f of book.formats || []) {
    const current = selectedByType[f.format];
    // Prefer an available format row when duplicates exist for the same type.
    if (!current || (current.is_available === false && f.is_available !== false)) {
      selectedByType[f.format] = f;
    }
  }
  for (const f of Object.values(selectedByType)) {
    if (f.format === "ebook") {
      formats.ebook = {
        available: f.is_available !== false,
        price: Number(f.price) || 0,
        pages: f.pages || 0,
        fileSize: f.file_size || "",
        previewChapters: f.preview_chapters ?? undefined,
        previewPercentage: f.preview_percentage ?? null,
      };
    } else if (f.format === "audiobook") {
      const n = f.narrator;
      const toNarrator = (raw: any) => ({
        id: raw.id, name: raw.name, nameEn: raw.name_en || "",
        avatar: toMediaUrl(raw.avatar_url) || "", bio: raw.bio || "",
        specialty: raw.specialty || "", audiobooksCount: 0,
        listeners: "0", rating: Number(raw.rating) || 0,
        isFeatured: raw.is_featured || false,
      })
      const narrators = Array.isArray(f.narrators) ? f.narrators.map(toNarrator) : []
      formats.audiobook = {
        available: f.is_available !== false,
        price: Number(f.price) || 0,
        duration: formatDuration(f.duration),
        narrator: n
          ? toNarrator(n)
          : { id: "", name: "", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
        narrators: narrators.length > 0 ? narrators : (n ? [toNarrator(n)] : []),
        chapters: f.chapters_count || 0,
        quality: (f.audio_quality as "standard" | "hd") || "standard",
        previewPercentage: (f as any).preview_percentage ?? null,
      };
    } else if (f.format === "hardcopy") {
      formats.hardcopy = {
        available: f.is_available !== false && f.in_stock !== false,
        price: Number(f.price) || 0,
        originalPrice: f.original_price ? Number(f.original_price) : undefined,
        discount: f.discount || undefined,
        pages: f.pages || 0,
        binding: (f.binding as "paperback" | "hardcover") || "paperback",
        weight: f.weight || "",
        dimensions: f.dimensions || "",
        inStock: f.in_stock !== false,
        stockCount: f.stock_count || 0,
        deliveryDays: f.delivery_days || 3,
      };
    }
  }

  return {
    id: book.id,
    title: book.title,
    titleEn: book.title_en || "",
    slug: book.slug,
    author,
    translator,
    publisher,
    category,
    cover: toMediaUrl(book.cover_url) || "",
    description: stripHtml(book.description || ""),
    descriptionBn: stripHtml(book.description_bn || book.description || ""),
    rating: Number(book.rating) || 0,
    reviewsCount: book.reviews_count || 0,
    totalReads: String(book.total_reads || 0),
    totalListens: String(book.total_listens || 0),
    publishedDate: book.published_date ? String(book.published_date).slice(0, 10) : "",
    language: book.language || "bn",
    tags: book.tags || [],
    isFeatured: book.is_featured || false,
    isNew: book.is_new || false,
    isBestseller: book.is_bestseller || false,
    isFree: book.is_free || false,
    formats,
  };
}

/**
 * `format` narrows every list below server-side (not client-filtered afterward, which
 * would silently shrink an already-capped batch down to whatever few items happen to
 * match — the same undercounting bug fixed on the REST homepage endpoints). Pass the
 * caller's own resolved filter (local `ContentToggle` state on desktop sections that
 * have one, `globalFilter` otherwise) — omit it (or "all") for the unfiltered default.
 */
export function useBooks(format?: "ebook" | "audiobook" | "hardcopy", search?: string) {
  const { data, isLoading: loading } = trpc.books.list.useQuery(
    { limit: 100, format, search: search || undefined },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );

  // Fetched directly by id (not derived from the capped 100-book `list` above) so a
  // genuinely trending older book, or one marked "new" outside the most-recently-created
  // 100, still shows up here — mirrors the REST homepage API's trendingNow/NewReleases.
  const { data: trendingData } = trpc.books.trending.useQuery(
    { periodDays: 7, format, search: search || undefined },
    { staleTime: 5 * 60 * 1000 }
  );
  const { data: newReleasesData } = trpc.books.list.useQuery(
    { isNew: true, limit: 20, format, search: search || undefined },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );

  // Same reasoning as trending/newReleases above: queried directly (popularity-sorted,
  // full catalog) rather than filtered out of the capped `list`, so these match the
  // equivalent mobile REST sections instead of silently dropping older popular/free books.
  // audiobooks/hardcopies are already locked to their one format below — `format`/`search`
  // don't apply to them, each has its own independent search via useBooks elsewhere.
  const { data: audiobooksData } = trpc.books.browseBooks.useQuery(
    { format: "audiobook", sort: "popular", pageSize: 10 },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );
  const { data: hardcopiesData } = trpc.books.browseBooks.useQuery(
    { format: "hardcopy", sort: "popular", pageSize: 10 },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );
  const { data: freeBooksData } = trpc.books.browseBooks.useQuery(
    { filter: "free", sort: "popular", pageSize: 10, format, query: search || undefined },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );

  const books = useMemo(() => (data?.books || []).map(trpcBookToMasterBook), [data]);

  const newReleases = useMemo(() => (newReleasesData?.books || []).map(trpcBookToMasterBook), [newReleasesData]);
  const featured = useMemo(() => books.filter((b) => b.isFeatured), [books]);

  const trending = useMemo(() => {
    if (trendingData && trendingData.length > 0) {
      return trendingData.map(trpcBookToMasterBook);
    }
    return [...books]
      .sort((a, b) => parseInt(String(b.totalReads)) - parseInt(String(a.totalReads)))
      .slice(0, 8);
  }, [books, trendingData]);

  const audiobooks = useMemo(() => (audiobooksData?.books || []).map(trpcBookToMasterBook), [audiobooksData]);
  const hardcopies = useMemo(() => (hardcopiesData?.books || []).map(trpcBookToMasterBook), [hardcopiesData]);
  const freeBooks = useMemo(() => (freeBooksData?.books || []).map(trpcBookToMasterBook), [freeBooksData]);
  const editorsPick = featured[0] || books[0] || null;

  return { books, loading, newReleases, featured, trending, audiobooks, hardcopies, freeBooks, editorsPick };
}

const PAGE_SIZE = 30;

interface BrowseFilters {
  format?: string | null;
  filter?: string | null;
  categoryId?: string | null;
  tag?: string | null;
  query?: string | null;
  sort?: string | null;
}

export function useBrowseBooks(filters: BrowseFilters) {
  const [page, setPage] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const prevFiltersKey = useRef(filtersKey);

  useEffect(() => {
    if (prevFiltersKey.current !== filtersKey) {
      prevFiltersKey.current = filtersKey;
      setPage(0);
    }
  }, [filtersKey]);

  const { data, isLoading: loading } = trpc.books.browseBooks.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      format: (filters.format as "ebook" | "audiobook" | "hardcopy") || undefined,
      categoryId: filters.categoryId || undefined,
      tag: filters.tag || undefined,
      filter: (filters.filter as "free" | "new" | "bestseller" | "trending") || undefined,
      query: filters.query || undefined,
      sort: (filters.sort as "newest" | "rating" | "popular") || undefined,
    },
    { staleTime: 2 * 60 * 1000, placeholderData: (prev: any) => prev }
  );

  const books = useMemo(() => (data?.books || []).map(trpcBookToMasterBook), [data]);
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
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),
    PAGE_SIZE,
  };
}

export function useAuthors(opts?: { page?: number; pageSize?: number; search?: string; featuredOnly?: boolean }) {
  const { data } = trpc.books.authors.useQuery(
    opts ? { page: opts.page ?? 0, pageSize: opts.pageSize ?? 500, search: opts.search || undefined, featuredOnly: opts.featuredOnly } : undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  const items = (data?.data ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    nameEn: a.name_en || "",
    avatar: toMediaUrl(a.avatar_url) || "",
    bio: a.bio || "",
    genre: a.genre || "",
    booksCount: a.booksCount || 0,
    followers: String(a.followers || 0),
    isFeatured: a.is_featured || false,
  }));

  return { authors: items, total: data?.total ?? 0 };
}

export function useNarrators(opts?: { search?: string; featuredOnly?: boolean }) {
  const { data: narrators = [] } = trpc.books.narrators.useQuery(
    opts ? { search: opts.search || undefined, featuredOnly: opts.featuredOnly } : undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  return narrators.map((n: any) => ({
    id: n.id,
    name: n.name,
    nameEn: n.name_en || "",
    avatar: toMediaUrl(n.avatar_url) || "",
    bio: n.bio || "",
    specialty: n.specialty || "",
    audiobooksCount: n.audiobooksCount || 0,
    listeners: String(n.listeners || 0),
    totalListens: String(n.totalListens || 0),
    rating: Number(n.rating) || 0,
    isFeatured: n.is_featured || false,
  }));
}

export function useTranslators(opts?: { page?: number; pageSize?: number; search?: string; featuredOnly?: boolean }) {
  const { data } = trpc.books.translators.useQuery(
    opts ? { page: opts.page ?? 0, pageSize: opts.pageSize ?? 500, search: opts.search || undefined, featuredOnly: opts.featuredOnly } : undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  const items = (data?.data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    nameEn: t.name_en || "",
    avatar: toMediaUrl(t.avatar_url) || "",
    bio: t.bio || "",
    genre: t.genre || "",
    booksCount: t.booksCount || 0,
    followers: String(t.followers || 0),
    isFeatured: t.is_featured || false,
  }));

  return { translators: items, total: data?.total ?? 0 };
}

export function usePublishers(opts?: { page?: number; pageSize?: number; search?: string; featuredOnly?: boolean }) {
  const { data } = trpc.books.publishers.useQuery(
    opts ? { page: opts.page ?? 0, pageSize: opts.pageSize ?? 500, search: opts.search || undefined, featuredOnly: opts.featuredOnly } : undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  const items = (data?.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    nameEn: p.name_en || "",
    avatar: toMediaUrl(p.logo_url) || "",
    bio: p.description || "",
    booksCount: p.booksCount || 0,
    followers: String(p.followers || 0),
    isFeatured: p.is_featured || false,
  }));

  return { publishers: items, total: data?.total ?? 0 };
}

export function useCategories(search?: string) {
  const { data: cats = [] } = trpc.books.categories.useQuery(
    search ? { search } : undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  return cats.map((c: any) => ({
    id: c.id,
    name: c.name,
    nameBn: c.name_bn || c.name,
    icon: c.icon || "",
    count: String(c._count?.books ?? 0),
    color: c.color || "primary",
  }));
}

export function useTags(search?: string) {
  const { data: tags = [] } = trpc.books.tags.useQuery(
    search ? { search } : undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  return tags.map((t: any) => ({
    tag: t.tag as string,
    count: t.count as number,
  }));
}
