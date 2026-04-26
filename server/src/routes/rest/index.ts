import { Router } from "express";
import { authRestRouter } from "./auth.js";
import { booksRestRouter } from "./books.js";
import {homepageRestRouter} from './homepage.js';
import {footerRestRouter} from './footer.js';
import { profileRestRouter } from "./profile.js";
import { meRestRouter } from "./me.js";
import { profileRolesRestRouter } from "./profile-roles.js";
import { categoriesRestRouter } from "./categories.js";

export const restRouter = Router();

restRouter.use("/auth", authRestRouter);
restRouter.use("/books", booksRestRouter);
restRouter.use("/homepage", homepageRestRouter);
restRouter.use("/footer", footerRestRouter);
restRouter.use("/profile", profileRestRouter);
restRouter.use("/me", meRestRouter);
restRouter.use("/profile/roles", profileRolesRestRouter);
restRouter.use("/categories", categoriesRestRouter);
