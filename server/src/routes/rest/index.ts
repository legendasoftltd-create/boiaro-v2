import { Router } from "express";
import { authRestRouter } from "./auth.js";
import { booksRestRouter } from "./books.js";

export const restRouter = Router();

restRouter.use("/auth", authRestRouter);
restRouter.use("/books", booksRestRouter);
