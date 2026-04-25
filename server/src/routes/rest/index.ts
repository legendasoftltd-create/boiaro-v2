import { Router } from "express";
import { authRestRouter } from "./auth.js";
import { booksRestRouter } from "./books.js";
import {homepageRestRouter} from './homepage.js';
import {footerRestRouter} from './footer.js';

export const restRouter = Router();

restRouter.use("/auth", authRestRouter);
restRouter.use("/books", booksRestRouter);
restRouter.use("/homepage", homepageRestRouter);
restRouter.use("/footer", footerRestRouter);
