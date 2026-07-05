import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getHomepageData } from "../../services/homepage.service.js";
import { prisma } from "../../lib/prisma.js";
import { resolveBookUrls } from "../../lib/mediaUrl.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export const homepageRestRouter = Router();

const ALLOWED_HOMEPAGE_TYPES = new Set(["ebook", "audiobook", "hardcopy", "hardcover"]);

// Sections that support independent DB-level pagination
const PAGINATED_SECTIONS = new Set([
  "trendingNow", "newReleases", "popularBooks",
  "popularAudiobooks", "popularHardCopies", "popularEbooks",
]);

const parsePaginationQuery = (query: Record<string, any>) => ({
  limit: Math.min(Math.max(Number(query.limit ?? 20), 1), 50),
  offset: Math.max(Number(query.offset ?? 0), 0),
});

const bookSelect = {
  id: true, title: true, title_en: true, slug: true,
  cover_url: true, rating: true, total_reads: true, is_free: true, is_featured: true, created_at: true,
  author: { select: { id: true, name: true, avatar_url: true } },
  translator: { select: { id: true, name: true, avatar_url: true } },
  category: { select: { id: true, name: true, slug: true } },
  formats: { where: { is_available: true }, select: { format: true, price: true, in_stock: true } },
} as const;

async function getPaginatedSection(section: string, limit: number, offset: number) {
  if (section === "trendingNow") {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activity = await prisma.userActivityLog.findMany({
      where: { action: { in: ["book_view", "book_read", "book_purchase"] }, created_at: { gte: since }, book_id: { not: null } },
      select: { book_id: true },
    });
    const scores: Record<string, number> = {};
    activity.forEach((r) => { if (r.book_id) scores[r.book_id] = (scores[r.book_id] || 0) + 1; });
    const allTrendingIds = Object.entries(scores).sort(([, a], [, b]) => b - a).map(([id]) => id);
    const total = allTrendingIds.length;
    const pageIds = allTrendingIds.slice(offset, offset + limit);
    const books = await prisma.book.findMany({
      where: { id: { in: pageIds }, submission_status: "approved" },
      select: bookSelect,
    });
    const bookMap = new Map(books.map((b) => [b.id, b]));
    const ordered = pageIds.map((id) => bookMap.get(id)).filter(Boolean).map(resolveBookUrls);
    return { data: ordered, total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "newReleases") {
    const where = { submission_status: "approved" } as const;
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: { created_at: "desc" }, skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularBooks") {
    const where = { submission_status: "approved", total_reads: { not: null } } as const;
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: { total_reads: "desc" }, skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularAudiobooks") {
    const where = { submission_status: "approved", formats: { some: { format: "audiobook", is_available: true } } } as const;
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: { total_reads: "desc" }, skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularHardCopies") {
    const where = { submission_status: "approved", formats: { some: { format: "hardcopy" as const, is_available: true } } } as const;
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: { total_reads: "desc" }, skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
  }

  if (section === "popularEbooks") {
    const where = { submission_status: "approved", formats: { some: { format: "ebook", is_available: true } } } as const;
    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, orderBy: { total_reads: "desc" }, skip: offset, take: limit, select: bookSelect }),
      prisma.book.count({ where }),
    ]);
    return { data: books.map(resolveBookUrls), total, limit, offset, has_more: offset + limit < total };
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
      const result = await getPaginatedSection(section, limit, offset);
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
