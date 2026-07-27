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

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function guessImageType(url: string): string {
  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME[ext] ?? "image/jpeg";
}

function buildHtml(meta: {
  title: string;
  description: string;
  image: string;
  url: string;
  imageWidth: number;
  imageHeight: number;
}): string {
  const t = esc(meta.title);
  const d = esc(meta.description);
  const img = esc(meta.image);
  const url = esc(meta.url);
  const imgType = guessImageType(meta.image);

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
  <meta property="og:image:width" content="${meta.imageWidth}"/>
  <meta property="og:image:height" content="${meta.imageHeight}"/>
  <meta property="og:image:type" content="${imgType}"/>
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

  // Match /book/:slug (single path segment, no trailing slash required) —
  // this is the actual frontend route (src/App.tsx), singular not plural.
  const m = req.path.match(/^\/book\/([^/?#]+)/);
  if (!m) return next();

  // req.path is percent-encoded (Express doesn't decode it) — Bengali slugs
  // arrive as UTF-8 escape sequences and must be decoded before the DB lookup.
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    return next();
  }

  try {
    const book = await prisma.book.findFirst({
      where: { slug, is_active: true, submission_status: "approved" },
      select: { title: true, description: true, description_bn: true, cover_url: true, slug: true },
    });

    if (!book) return next();

    const resolvedCover = resolveFileUrl(book.cover_url);
    const coverUrl = resolvedCover || FALLBACK_IMAGE;
    // Book covers are portrait; the generated site-wide fallback is a 1200x630 card.
    const [imageWidth, imageHeight] = resolvedCover ? [800, 1200] : [1200, 630];
    const rawDescription = book.description || book.description_bn || "বইআরোতে এই বইটি পড়ুন।";
    const description = rawDescription.replace(/\s+/g, " ").trim().slice(0, 200);
    const pageUrl = `${SITE_URL}/book/${book.slug}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.send(
      buildHtml({ title: book.title, description, image: coverUrl, url: pageUrl, imageWidth, imageHeight })
    );
  } catch {
    return next();
  }
}
