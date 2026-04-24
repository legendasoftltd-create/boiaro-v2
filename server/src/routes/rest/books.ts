import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { bookByIdSchema, bookListSchema } from "../../schemas/books.js";
import { getBookById, listBooks } from "../../services/books.service.js";

export const booksRestRouter = Router();

booksRestRouter.get("/", async (req, res) => {
  try {
    const input = bookListSchema.parse(req.query);
    const result = await listBooks(input);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

booksRestRouter.get("/:id", async (req, res) => {
  try {
    const input = bookByIdSchema.parse(req.params);
    const result = await getBookById(input.id);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});
