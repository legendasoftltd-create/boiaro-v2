import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";

export const blogRestRouter = Router();

// GET /blog — list published posts, optionally filtered by ?category=
// (e.g. "news", "event", "award" for the About section's News/Events/Awards
// pages) — mirrors tRPC books.blogPosts
blogRestRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;

    const posts = await prisma.blogPost.findMany({
      where: { status: "published", ...(category ? { category } : {}) },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { publish_date: "desc" },
      select: {
        id: true, title: true, slug: true, excerpt: true, cover_image: true,
        category: true, tags: true, author_name: true, publish_date: true,
        is_featured: true,
      },
    });

    let nextCursor: string | undefined;
    if (posts.length > limit) {
      nextCursor = posts.pop()!.id;
    }
    res.json({ posts, nextCursor });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// GET /blog/:slug — mirrors tRPC books.blogPost
blogRestRouter.get("/:slug", async (req, res) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: String(req.params.slug) } });
    if (!post || post.status !== "published") {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json(post);
  } catch (error) {
    sendHttpError(res, error);
  }
});
