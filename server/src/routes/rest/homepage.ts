import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getHomepageData } from "../../services/homepage.service.js";
import {
  getBecauseYouReadRecommendations,
  getBestSellerBookIds, getTrendingAudiobookIds, getTopAudiobookIds,
} from "../../services/books.service.js";
import { prisma } from "../../lib/prisma.js";
import { resolveBookUrls } from "../../lib/mediaUrl.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export const homepageRestRouter = Router();

const ALLOWED_HOMEPAGE_TYPES = new Set(["ebook", "audiobook", "hardcopy", "hardcover"]);

function normalizeHomepageType(rawType: string | undefined): "ebook" | "audiobook" | "hardcopy" | undefined {
  if (!rawType) return undefined;
  const value = rawType.toLowerCase();
  if (value === "hardcopy" || value === "hardcover") return "hardcopy";
  if (value === "ebook" || value === "audiobook") return value;
  return undefined;
}

// Sections that support independent DB-level pagination
const PAGINATED_SECTIONS = new Set([
  "trendingNow", "newReleases", "popularBooks",
  "popularAudiobooks", "popularHardCopies", "popularEbooks",
  "editorsPick", "freeBooks", "topMostRead", "becauseYouRead",
  "bestSellers", "specialOffers", "trendingAudiobooks", "topAudiobooks",
]);

const parsePaginationQuery = (query: Record<string, any>) => ({
  limit: Math.min(Math.max(Number(query.limit ?? 20), 1), 50),
  offset: Math.max(Number(query.offset ?? 0), 0),
});

const bookSelect = {
  id: true, title: true, title_en: true, slug: true,
  cover_url: true, rating: true, total_reads: true, is_free: true, is_featured: true, subscriber_access: true, created_at: true,
  author: { select: { id: true, name: true, avatar_url: true } },
  translator: { select: { id: true, name: true, avatar_url: true } },
  category: { select: { id: true, name: true, slug: true } },
  formats: { where: { is_available: true }, select: { format: true, price: true, original_price: true, discount: true, in_stock: true } },
} as const;

// Shared by bestSellers/trendingAudiobooks/topAudiobooks below: candidateIds
// is a pre-ranked (best first) list of book ids from an aggregate query;
// rankById supplies the actual rank value used to re-sort after the id list
// gets narrowed by format/search/approval status/pagination — narrowing can
// drop ids, so the original array order can't just be sliced directly.
async function fetchRankedSection(
  candidateIds: string[],
  rankById: Map<string, number>,
  opts: { requiredFormat: "hardcopy" | "audiobook"; search?: string; limit: number; offset: number }
) {
  if (candidateIds.length === 0) return { data: [], total: 0, limit: opts.limit, offset: opts.offset, has_more: false };
  const books = await prisma.book.findMany({
    where: {
      id: { in: candidateIds },
      submission_status: "approved",
      is_active: true,
      formats: { some: { format: opts.requiredFormat, is_available: true, submission_status: "approved" } },
      ...(opts.search && { title: { contains: opts.search, mode: "insensitive" as const } }),
    },
    select: bookSelect,
  });
  const ranked = books.slice().sort((a, b) => (rankById.get(b.id) ?? 0) - (rankById.get(a.id) ?? 0));
  const total = ranked.length;
  const page = ranked.slice(opts.offset, opts.offset + opts.limit).map(resolveBookUrls);
  return { data: page, total, limit: opts.limit, offset: opts.offset, has_more: opts.offset + opts.limit < total };
}

async function getPaginatedSection(section: string, limit: number, offset: number, userId?: string, format?: "ebook" | "audiobook" | "hardcopy", search?: string) {
  const formatWhere = format
    ? { formats: { some: { format, is_available: true, submission_status: "approved" as const } } }
    : {};
  const searchWhere = search
    ? { title: { contains: search, mode: "insensitive" as const } }
    : {};

  if (section === "trendingNow") {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activity = await prisma.userActivityLog.findMany({
      where: { action: { in: ["book_view", "book_read", "book_purchase"] }, created_at: { gte: since }, book_id: { not: null } },
      select: { book_id: true },
    });
    const scores: Record<string, number> = {};
    activity.forEach((r) => { if (r.book_id) scores[r.book_id] = (scores[r.book_id] || 0) + 1; });
    // Admin-set `priority` dominates the ranking (ascending — 1 before 2 before 3 —
    // with unset/null priority sorting last); the activity score is the tiebreaker
    // among equal-priority books (the scoring itself is unchanged). The `format` filter
    // is applied here too — before ranking/slicing — not on the final page afterward.
    const candidateIds = Object.keys(scores);
    const priorityRows = candidateIds.length > 0
      ? await prisma.book.findMany({ where: { id: { in: candidateIds }, ...formatWhere, ...searchWhere }, select: { id: true, priority: true } })
      : [];
    const priorityById = new Map(priorityRows.map((r) => [r.id, r.priority]));
    // Ranked from `priorityRows` (already format-filtered), not the original unfiltered
    // `candidateIds` — otherwise non-matching-format candidates would occupy pagination
    // slots ahead of matching ones, then get silently dropped at the fetch below.
    const allTrendingIds = priorityRows
      .map((r) => r.id)
      .sort((a, b) => {
        const pa = priorityById.get(a) ?? Infinity;
        const pb = priorityById.get(b) ?? Infinity;
        if (pa !== pb) return pa - pb;
        return scores[b] - scores[a];
      });
    const total = allTrendingIds.length;
    const pageIds = allTrendingIds.slice(offset, offset + limit);
    const books = await prisma.book.findMany({
      where: { id: { in: pageIds }, submission_status: "approved", is_active: true },
      select: bookSelect,
    });
    const bookMap = new Map(books.map((b) => [b.id, b]));
    const ordered = pageIds.map((id) => bookMap.get(id)).filter(Boolean).map(resolveBookUrls);
    return { data: ordered, total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "newReleases") {
    const where = { submission_status: "approved", is_new: true, is_active: true, ...formatWhere, ...searchWhere };
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularBooks") {
    const where = { submission_status: "approved", is_active: true, total_reads: { not: null }, ...formatWhere, ...searchWhere };
    // `id: asc` tiebreaker: total_reads ties are common, and without a secondary
    // sort key skip/take pagination isn't stable across pages (a tied book can be
    // duplicated or skipped), and the order can disagree with the web tRPC
    // equivalent (books.browseBooks sort=popular) which uses the same tiebreaker.
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }, { id: "asc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularAudiobooks") {
    // Already a single-format section — a `format` filter for a different format has
    // nothing to show here, matching how the non-paginated snapshot zeroes these out
    // (homepage.service.ts's popularAudiobooks/popularHardCopies/popularEbooks).
    if (format && format !== "audiobook") return { data: [], total: 0, limit, offset, has_more: false };
    const where = { submission_status: "approved", is_active: true, formats: { some: { format: "audiobook" as const, is_available: true, submission_status: "approved" } }, ...searchWhere };
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }, { id: "asc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularHardCopies") {
    if (format && format !== "hardcopy") return { data: [], total: 0, limit, offset, has_more: false };
    const where = { submission_status: "approved", is_active: true, formats: { some: { format: "hardcopy" as const, is_available: true, submission_status: "approved" } }, ...searchWhere };
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }, { id: "asc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularEbooks") {
    if (format && format !== "ebook") return { data: [], total: 0, limit, offset, has_more: false };
    const where = { submission_status: "approved", is_active: true, formats: { some: { format: "ebook" as const, is_available: true, submission_status: "approved" } }, ...searchWhere };
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }, { id: "asc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "editorsPick") {
    const where = { submission_status: "approved", is_active: true, is_featured: true, ...formatWhere, ...searchWhere };
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "freeBooks") {
    const where = { submission_status: "approved", is_active: true, is_free: true, ...formatWhere, ...searchWhere };
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { total_reads: "desc" }, { id: "asc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "topMostRead") {
    // Deliberately exempt from admin `priority` — this section's whole point is genuine
    // reader behavior, so a manually-boosted low-read book must never outrank a book
    // real readers are actually reading (mirrors trpc.books.browseBooks sort=mostRead).
    const where = { submission_status: "approved", is_active: true, ...formatWhere, ...searchWhere };
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: [{ total_reads: "desc" }, { id: "asc" }], skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "bestSellers") {
    // Real sales (OrderItem.quantity summed per hardcopy book, non-cancelled/
    // returned/pending orders, rolling 180 days), not the manually-admin-set
    // Book.is_bestseller flag — see getBestSellerBookIds for the full query.
    if (format && format !== "hardcopy") return { data: [], total: 0, limit, offset, has_more: false };
    const { candidateIds, rankById } = await getBestSellerBookIds();
    return fetchRankedSection(candidateIds, rankById, { requiredFormat: "hardcopy", search, limit, offset });
  }

  if (section === "specialOffers") {
    // Hardcopy books currently carrying an admin-set discount, ranked by
    // discount % (highest first) — sorted in JS since Prisma can't order by
    // a filtered to-many relation's scalar field directly.
    if (format && format !== "hardcopy") return { data: [], total: 0, limit, offset, has_more: false };
    const where = {
      submission_status: "approved", is_active: true,
      formats: { some: { format: "hardcopy" as const, is_available: true, submission_status: "approved", discount: { gt: 0 } } },
      ...searchWhere,
    };
    const candidates = await prisma.book.findMany({
      where, orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }], take: 300, select: bookSelect,
    });
    const discountOf = (b: any) => b.formats.find((f: any) => f.format === "hardcopy")?.discount ?? 0;
    const ranked = candidates.slice().sort((a, b) => discountOf(b) - discountOf(a));
    const total = ranked.length;
    const page = ranked.slice(offset, offset + limit).map(resolveBookUrls);
    return { data: page, total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "trendingAudiobooks") {
    // Recent (14-day) unique-listener growth — distinct from popularAudiobooks
    // above, which ranks by the generic, all-time, shared-with-ebooks
    // total_reads counter. See getTrendingAudiobookIds.
    if (format && format !== "audiobook") return { data: [], total: 0, limit, offset, has_more: false };
    const { candidateIds, rankById } = await getTrendingAudiobookIds();
    return fetchRankedSection(candidateIds, rankById, { requiredFormat: "audiobook", search, limit, offset });
  }

  if (section === "topAudiobooks") {
    // "Top 10 Audiobooks" — same BookListen source as trendingAudiobooks, no
    // recency window: all-time unique-listener count. Callers wanting exactly
    // the top 10 should pass limit=10.
    if (format && format !== "audiobook") return { data: [], total: 0, limit, offset, has_more: false };
    const { candidateIds, rankById } = await getTopAudiobookIds();
    return fetchRankedSection(candidateIds, rankById, { requiredFormat: "audiobook", search, limit, offset });
  }

  if (section === "becauseYouRead") {
    // Real personalization (reading/listening progress + book-view history), shared with the
    // web tRPC procedure. Never shown to guests — an unauthenticated request just gets an
    // empty page rather than an error, so the mobile app's existing empty-state handling
    // (already required for e.g. a logged-in user with no history) covers this too.
    if (!userId) {
      return { data: [], total: 0, limit, offset, has_more: false };
    }
    const result = await getBecauseYouReadRecommendations(userId, Math.min(offset + limit, 30), format, search);
    const total = result.books.length;
    const page = result.books.slice(offset, offset + limit);
    return { data: page, total, limit, offset, has_more: offset + limit < total };
  }

  return null;
}

homepageRestRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const rawType = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
    if (typeof rawType === "string" && !ALLOWED_HOMEPAGE_TYPES.has(rawType.toLowerCase())) {
      return res.status(400).json({ error: "Invalid type. Allowed values: ebook, audiobook, hardcopy" });
    }
    const userId = req.auth?.userId ?? undefined;
    const result = await getHomepageData(rawLimit, userId, typeof rawType === "string" ? rawType : undefined);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

homepageRestRouter.get("/:section", async (req: AuthenticatedRequest, res) => {
  try {
    const rawType = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
    if (typeof rawType === "string" && !ALLOWED_HOMEPAGE_TYPES.has(rawType.toLowerCase())) {
      return res.status(400).json({ error: "Invalid type. Allowed values: ebook, audiobook, hardcopy" });
    }
    const section = Array.isArray(req.params.section) ? req.params.section[0] : req.params.section;

    // For book-list sections: direct paginated DB query
    if (PAGINATED_SECTIONS.has(section)) {
      const { limit, offset } = parsePaginationQuery(req.query);
      const format = normalizeHomepageType(typeof rawType === "string" ? rawType : undefined);
      const rawSearch = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
      const search = typeof rawSearch === "string" && rawSearch.trim() ? rawSearch.trim() : undefined;
      const result = await getPaginatedSection(section, limit, offset, req.auth?.userId, format, search);
      if (!result) return res.status(404).json({ error: "Section not found" });
      return res.json({ section, ...result });
    }

    // For other sections: full homepage snapshot (non-paginated)
    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const userId = req.auth?.userId ?? undefined;
    const homepageData = await getHomepageData(rawLimit, userId, typeof rawType === "string" ? rawType : undefined);

    const sectionMap: Record<string, unknown> = {
      slider: homepageData.slider,
      becauseYouRead: homepageData.BecauseYouRead,
      editorsPick: homepageData.editorsPick,
      appDownload: homepageData.appDownload,
      topMostRead: homepageData.topTenMostRead,
      allCategory: homepageData.allCategory,
      allAuthor: homepageData.allAuthor,
      allNarrators: homepageData.allNarrators,
      allTranslators: homepageData.allTranslators,
      countsValue: homepageData.countsValue,
      freeBooks: homepageData.FreeBooks,
      continueReading: homepageData.continueReading,
      continueListening: homepageData.continueListening,
      radio: homepageData.radio,
      currentUser: homepageData.currentUser,
    };

    if (!section || !(section in sectionMap)) {
      return res.status(404).json({ error: "Homepage section not found" });
    }

    return res.json({ section, data: sectionMap[section] });
  } catch (error) {
    return sendHttpError(res, error);
  }
});
