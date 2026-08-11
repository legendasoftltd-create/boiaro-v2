import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { searchBooks, type SearchBookFormat } from "../../services/search.service.js";

export const searchRestRouter = Router();

const VALID_FORMATS = ["ebook", "audiobook", "hardcopy"] as const;

function parseFormat(raw: unknown): SearchBookFormat | undefined {
  return typeof raw === "string" && (VALID_FORMATS as readonly string[]).includes(raw) ? (raw as SearchBookFormat) : undefined;
}

searchRestRouter.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (q.length < 2) {
      return res.status(400).json({
        error: "Search query too short (min 2 chars)",
      });
    }

    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    // Silently ignored if invalid/absent — matches /books, /category-sections,
    // and /categories/:id/books, which don't error on a bad format value
    // (unlike /homepage, the one endpoint that does).
    const format = parseFormat(req.query.format);

    const result = await searchBooks(q, limit, offset, format);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});
