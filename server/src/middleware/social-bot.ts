import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

// User-agents of social media link-preview crawlers / SEO bots.
// These don't run JavaScript so we must return server-rendered meta tags.
const BOT_RE =
  /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|linkedinbot|slackbot|discordbot|applebot|googlebot|bingbot|pinterestbot|redditbot|vkshare|w3c_validator|rogerbot|embedly|quora\s*link\s*preview|showyoubot|outbrain|msnbot/i;

const SITE_URL = (process.env.BASE_URL || process.env.FRONTEND_URL || "https://boiaro.com").replace(/\/$/, "");
const SITE_NAME = "BoiAro";
const FALLBACK_IMAGE = `${SITE_URL}/og-image.png`;

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHtml(meta: {
  title: string;
  description: string;
  image: string;
  url: string;
}): string {
  const t = esc(meta.title);
  const d = esc(meta.description);
  const img = esc(meta.image);
  const url = esc(meta.url);

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8"/>
  <title>${t} — ${SITE_NAME}</title>
  <link rel="canonical" href="${url}"/>
  <meta property="og:type" content="book"/>
  <meta property="og:site_name" content="${SITE_NAME}"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:title" content="${t} — ${SITE_NAME}"/>
  <meta property="og:description" content="${d}"/>
  <meta property="og:image" content="${img}"/>
  <meta property="og:image:width" content="800"/>
  <meta property="og:image:height" content="1200"/>
  <meta property="og:image:type" content="image/jpeg"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:site" content="@boiaro"/>
  <meta name="twitter:title" content="${t} — ${SITE_NAME}"/>
  <meta name="twitter:description" content="${d}"/>
  <meta name="twitter:image" content="${img}"/>
  <meta name="description" content="${d}"/>
</head>
<body>
  <h1>${t}</h1>
  <p>${d}</p>
  <a href="${url}">Read on ${SITE_NAME}</a>
</body>
</html>`;
}

export async function socialBotMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET") return next();

  const ua = req.headers["user-agent"] ?? "";
  if (!BOT_RE.test(ua)) return next();

  // Match /books/:slug (single path segment, no trailing slash required)
  const m = req.path.match(/^\/books\/([^/?#]+)/);
  if (!m) return next();

  const slug = m[1];

  try {
    const book = await prisma.book.findFirst({
      where: { slug, is_active: true, submission_status: "approved" },
      select: { title: true, description: true, cover_url: true, slug: true },
    });

    if (!book) return next();

    const coverUrl = resolveFileUrl(book.cover_url) || FALLBACK_IMAGE;
    const description = (book.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const pageUrl = `${SITE_URL}/books/${book.slug}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.send(
      buildHtml({ title: book.title, description, image: coverUrl, url: pageUrl })
    );
  } catch {
    return next();
  }
}
