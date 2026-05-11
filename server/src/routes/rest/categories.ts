/**
 * REST Categories API
 * Base prefix: /api/v1/categories
 *
 *  GET  /          — list all active categories (with book counts + resolved icon URLs)
 *  GET  /:id       — single category by id or slug
 */

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllCategories, getCategoryById } from "../../services/categories.service.js";

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
