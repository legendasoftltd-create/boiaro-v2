/**
 * REST Categories API
 * Base prefix: /api/v1/categories
 *
 *  GET  /              — list all active categories (with book counts + resolved icon URLs)
 *  GET  /:id           — single category by id or slug
 *  GET  /:id/books     — paginated books in a category (id or slug)
 */

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllCategories, getCategoryById } from "../../services/categories.service.js";
import { prisma } from "../../lib/prisma.js";
import { resolveBookUrls } from "../../lib/mediaUrl.js";

export const categoriesRestRouter = Router();

// GET /api/v1/categories
categoriesRestRouter.get("/", async (_req, res) => {
  try {
    const result = await getAllCategories();
    res.json({ success: true, ...result });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /api/v1/categories/:id   (id or slug)
categoriesRestRouter.get("/:id", async (req, res) => {
  try {
    const category = await getCategoryById(String(req.params.id));
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found" });
      return;
    }
    res.json({ success: true, category });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /api/v1/categories/:id/books   (id or slug, offset-paginated)
categoriesRestRouter.get("/:id/books", async (req, res) => {
  try {
    const param = String(req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const VALID_FORMATS = ["ebook", "audiobook", "hardcopy"] as const;
    type BookFormat = typeof VALID_FORMATS[number];
    const rawFormat = typeof req.query.format === "string" ? req.query.format : undefined;
    const format = VALID_FORMATS.includes(rawFormat as BookFormat) ? (rawFormat as BookFormat) : undefined;

    const category = await prisma.category.findFirst({
      where: { OR: [{ id: param }, { slug: param }], status: "active" },
      select: { id: true, name: true, name_en: true, name_bn: true, slug: true, icon: true, color: true },
    });
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found" });
      return;
    }

    const where = {
      submission_status: "approved",
      category_id: category.id,
      ...(format && { formats: { some: { format, is_available: true } } }),
    };

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true, title: true, title_en: true, slug: true,
          cover_url: true, rating: true, total_reads: true, is_free: true,
          author: { select: { id: true, name: true, avatar_url: true } },
          translator: { select: { id: true, name: true } },
          formats: { where: { is_available: true }, select: { format: true, price: true, in_stock: true } },
        },
      }),
      prisma.book.count({ where }),
    ]);

    res.json({
      category,
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
