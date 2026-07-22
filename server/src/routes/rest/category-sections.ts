/**
 * REST Category Sections API
 * Base prefix: /api/v1/category-sections
 *
 *  GET  /          — paginated list of homepage category sections with preview books
 *  GET  /:id/books — paginated full book list for a specific category section
 */

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { resolveFileUrl, resolveBookUrls } from "../../lib/mediaUrl.js";

export const categorySectionsRestRouter = Router();

const VALID_FORMATS = ["ebook", "audiobook", "hardcopy"] as const;
type BookFormat = typeof VALID_FORMATS[number];

function parseFormat(raw: unknown): BookFormat | undefined {
  return typeof raw === "string" && VALID_FORMATS.includes(raw as BookFormat) ? (raw as BookFormat) : undefined;
}

// GET /api/v1/category-sections
categorySectionsRestRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const format = parseFormat(req.query.format);
    const rawSearch = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
    const search = typeof rawSearch === "string" && rawSearch.trim() ? rawSearch.trim() : undefined;
    // Optional override for how many preview books each section returns, independent of
    // the per-section `book_limit` an admin configured — capped the same way `limit` is.
    const rawBooksLimit = Number(req.query.books_limit);
    const booksLimitOverride = Number.isFinite(rawBooksLimit) && rawBooksLimit > 0
      ? Math.min(Math.floor(rawBooksLimit), 50)
      : undefined;

    const [sections, total] = await Promise.all([
      prisma.homepageCategorySection.findMany({
        orderBy: { sort_order: "asc" },
        skip: offset,
        take: limit,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              name_bn: true,
              name_en: true,
              slug: true,
              icon: true,
              color: true,
            },
          },
        },
      }),
      prisma.homepageCategorySection.count(),
    ]);

    const results = await Promise.all(
      sections.map(async (sec) => {
        const books = await prisma.book.findMany({
          where: {
            category_id: sec.category_id,
            submission_status: "approved",
            is_active: true,
            // Applied before `take` (not filtered after) so a format/search filter narrows
            // the candidate pool instead of shrinking an already-capped result.
            ...(format ? { formats: { some: { format, is_available: true, submission_status: "approved" } } } : {}),
            ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
          },
          take: booksLimitOverride ?? sec.book_limit,
          orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
          select: {
            id: true,
            title: true,
            title_en: true,
            slug: true,
            cover_url: true,
            rating: true,
            is_free: true,
            subscriber_access: true,
            author: { select: { id: true, name: true, name_en: true } },
            translator: { select: { id: true, name: true, name_en: true } },
            formats: { select: { format: true, price: true, is_available: true } },
          },
        });

        return {
          id: sec.id,
          title: sec.title ?? null,
          subtitle: sec.subtitle ?? null,
          category_id: sec.category_id,
          sort_order: sec.sort_order,
          book_limit: sec.book_limit,
          category: sec.category
            ? {
                id: sec.category.id,
                name: sec.category.name,
                name_bn: sec.category.name_bn ?? null,
                name_en: sec.category.name_en ?? null,
                slug: sec.category.slug ?? null,
                icon: resolveFileUrl(sec.category.icon) ?? sec.category.icon ?? null,
                color: sec.category.color ?? null,
              }
            : null,
          books: books.map((b) => ({
            id: b.id,
            title: b.title,
            title_en: b.title_en ?? null,
            slug: b.slug,
            cover_url: resolveFileUrl(b.cover_url),
            rating: Number(b.rating) || 0,
            is_free: b.is_free ?? false,
            author: b.author
              ? { id: b.author.id, name: b.author.name, name_en: b.author.name_en ?? null }
              : null,
            translator: b.translator
              ? { id: b.translator.id, name: b.translator.name, name_en: b.translator.name_en ?? null }
              : null,
            formats: (b.formats || []).map((f) => ({
              format: f.format,
              price: Number(f.price) || 0,
              is_available: f.is_available !== false,
            })),
          })),
        };
      })
    );

    res.json({ success: true, sections: results, total, limit, offset, has_more: offset + limit < total });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /api/v1/category-sections/:id/books — paginated "see all" for a section
categorySectionsRestRouter.get("/:id/books", async (req, res) => {
  try {
    const id = String(req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const format = parseFormat(req.query.format);
    const rawSearch = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
    const search = typeof rawSearch === "string" && rawSearch.trim() ? rawSearch.trim() : undefined;

    const section = await prisma.homepageCategorySection.findUnique({
      where: { id },
      select: { id: true, title: true, subtitle: true, category_id: true },
    });
    if (!section) {
      res.status(404).json({ success: false, error: "Section not found" });
      return;
    }

    const where = {
      category_id: section.category_id,
      submission_status: "approved",
      is_active: true,
      ...(format ? { formats: { some: { format, is_available: true, submission_status: "approved" } } } : {}),
      ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
    };
    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
        skip: offset,
        take: limit,
        select: {
          id: true, title: true, title_en: true, slug: true,
          cover_url: true, rating: true, total_reads: true, is_free: true, subscriber_access: true,
          author: { select: { id: true, name: true, avatar_url: true } },
          translator: { select: { id: true, name: true } },
          formats: { where: { is_available: true }, select: { format: true, price: true, in_stock: true } },
        },
      }),
      prisma.book.count({ where }),
    ]);

    res.json({
      section_id: section.id,
      title: section.title ?? null,
      subtitle: section.subtitle ?? null,
      books: books.map(resolveBookUrls),
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
