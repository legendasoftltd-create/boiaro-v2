import { Router } from "express";
import { authRestRouter } from "./auth.js";
import { booksRestRouter } from "./books.js";
import {homepageRestRouter} from './homepage.js';
import {footerRestRouter} from './footer.js';
import { profileRestRouter } from "./profile.js";

export const restRouter = Router();

restRouter.use("/auth", authRestRouter);
restRouter.use("/books", booksRestRouter);
restRouter.use("/homepage", homepageRestRouter);
restRouter.use("/footer", footerRestRouter);
restRouter.use("/profile", profileRestRouter);
