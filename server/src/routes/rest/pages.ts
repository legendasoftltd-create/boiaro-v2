import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";

export const pagesRestRouter = Router();

// GET /pages/:slug — static CMS page (About, Mission, Features, FAQ, Refund
// Policy, Privacy Policy, Terms, Contact, etc.) — mirrors tRPC books.cmsPage
pagesRestRouter.get("/:slug", async (req, res) => {
  try {
    const page = await prisma.cmsPage.findFirst({
      where: { slug: String(req.params.slug), status: "published" },
    });
    if (!page) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    res.json(page);
  } catch (error) {
    sendHttpError(res, error);
  }
});
