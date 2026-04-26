import { Router } from "express";
import { authRestRouter } from "./auth.js";
import { booksRestRouter } from "./books.js";
import {homepageRestRouter} from './homepage.js';
import {footerRestRouter} from './footer.js';
import { profileRestRouter } from "./profile.js";
import { meRestRouter } from "./me.js";
import { profileRolesRestRouter } from "./profile-roles.js";
import { categoriesRestRouter } from "./categories.js";
import { authorsRestRouter } from "./authors.js";
import { narratorsRestRouter } from "./narrators.js";
import { publishersRestRouter } from "./publishers.js";
import { searchRestRouter } from "./search.js";

export const restRouter = Router();

restRouter.use("/auth", authRestRouter);
restRouter.use("/books", booksRestRouter);
restRouter.use("/homepage", homepageRestRouter);
restRouter.use("/footer", footerRestRouter);
restRouter.use("/profile", profileRestRouter);
restRouter.use("/me", meRestRouter);
restRouter.use("/profile/roles", profileRolesRestRouter);
restRouter.use("/categories", categoriesRestRouter);
restRouter.use("/authors", authorsRestRouter);
restRouter.use("/narrators", narratorsRestRouter);
restRouter.use("/publishers", publishersRestRouter);
restRouter.use("/search", searchRestRouter);
