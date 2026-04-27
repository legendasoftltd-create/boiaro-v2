import { useMemo, useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import type { MasterBook, Author, Publisher, Category } from "@/lib/types";
import { toMediaUrl } from "@/lib/mediaUrl";
import { formatDuration } from "@/lib/duration";

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
  for (const f of book.formats || []) {
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
      formats.audiobook = {
        available: f.is_available !== false,
        price: Number(f.price) || 0,
        duration: formatDuration(f.duration),
        narrator: n
          ? {
              id: n.id, name: n.name, nameEn: n.name_en || "",
              avatar: toMediaUrl(n.avatar_url) || "", bio: n.bio || "",
              specialty: n.specialty || "", audiobooksCount: 0,
              listeners: "0", rating: Number(n.rating) || 0,
              isFeatured: n.is_featured || false,
            }
          : { id: "", name: "", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
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
    publisher,
    category,
    cover: toMediaUrl(book.cover_url) || "",
    description: book.description || "",
    descriptionBn: book.description_bn || book.description || "",
    rating: Number(book.rating) || 0,
    reviewsCount: book.reviews_count || 0,
    totalReads: String(book.total_reads || 0),
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

export function useBooks() {
  const { data, isLoading: loading } = trpc.books.list.useQuery(
    { limit: 100 },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );

  const { data: trendingIds = [] } = trpc.books.trending.useQuery(
    { periodDays: 7 },
    { staleTime: 5 * 60 * 1000 }
  );

  const books = useMemo(() => (data?.books || []).map(trpcBookToMasterBook), [data]);

  const newReleases = useMemo(() => books.filter((b) => b.isNew), [books]);
  const featured = useMemo(() => books.filter((b) => b.isFeatured), [books]);

  const trending = useMemo(() => {
    if (trendingIds.length > 0) {
      const idOrder = new Map(trendingIds.map((id: string, i: number) => [id, i]));
      return books
        .filter((b) => idOrder.has(b.id))
        .sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99));
    }
    return [...books]
      .sort((a, b) => parseInt(String(b.totalReads)) - parseInt(String(a.totalReads)))
      .slice(0, 8);
  }, [books, trendingIds]);

  const audiobooks = useMemo(() => books.filter((b) => b.formats.audiobook?.available).slice(0, 8), [books]);
  const hardcopies = useMemo(() => books.filter((b) => b.formats.hardcopy?.available).slice(0, 8), [books]);
  const freeBooks = useMemo(() => books.filter((b) => b.isFree), [books]);
  const editorsPick = featured[0] || books[0] || null;

  return { books, loading, newReleases, featured, trending, audiobooks, hardcopies, freeBooks, editorsPick };
}

const PAGE_SIZE = 30;

interface BrowseFilters {
  format?: string | null;
  filter?: string | null;
  categoryId?: string | null;
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

export function useAuthors() {
  const { data: authors = [] } = trpc.books.authors.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  return authors.map((a: any) => ({
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
}

export function useNarrators() {
  const { data: narrators = [] } = trpc.books.narrators.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  return narrators.map((n: any) => ({
    id: n.id,
    name: n.name,
    nameEn: n.name_en || "",
    avatar: toMediaUrl(n.avatar_url) || "",
    bio: n.bio || "",
    specialty: n.specialty || "",
    audiobooksCount: n.audiobooksCount || 0,
    listeners: String(n.listeners || 0),
    rating: Number(n.rating) || 0,
    isFeatured: n.is_featured || false,
  }));
}

export function useCategories() {
  const { data: cats = [] } = trpc.books.categories.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  return cats.map((c: any) => ({
    id: c.id,
    name: c.name,
    nameBn: c.name_bn || c.name,
    icon: c.icon || "BookOpen",
    count: "0",
    color: c.color || "primary",
  }));
}
