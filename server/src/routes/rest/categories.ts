// routes/rest/categories.router.ts

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllCategories } from "../../services/categories.service.js";

export const categoriesRestRouter = Router();

categoriesRestRouter.get("/", async (req, res) => {
  try {
    const result = await getAllCategories();

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});