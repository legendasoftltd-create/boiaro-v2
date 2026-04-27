// routes/rest/authors.router.ts

import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllAuthors, getAuthorById } from "../../services/authors.service.js";

export const authorsRestRouter = Router();

authorsRestRouter.get("/", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const result = await getAllAuthors(limit, offset);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

authorsRestRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getAuthorById(id);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});