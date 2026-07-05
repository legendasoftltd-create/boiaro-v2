import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { searchBooks } from "../../services/search.service.js";

export const searchRestRouter = Router();

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

    const result = await searchBooks(q, limit, offset);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});