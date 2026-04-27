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

    const result = await searchBooks(q);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});