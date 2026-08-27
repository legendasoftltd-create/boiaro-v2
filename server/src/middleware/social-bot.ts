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
  ogType?: string;
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
  <meta property="og:type" content="${meta.ogType ?? "website"}"/>
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

function cleanDescription(raw: string | null | undefined, fallback: string): string {
  return (raw || fallback).replace(/\s+/g, " ").trim().slice(0, 200);
}

async function buildBookMeta(slug: string) {
  const book = await prisma.book.findFirst({
    where: { slug, is_active: true, submission_status: "approved" },
    select: { title: true, description: true, description_bn: true, cover_url: true, slug: true },
  });
  if (!book) return null;

  const resolvedCover = resolveFileUrl(book.cover_url);
  const coverUrl = resolvedCover || FALLBACK_IMAGE;
  // Book covers are portrait; the generated site-wide fallback is a 1200x630 card.
  const [imageWidth, imageHeight] = resolvedCover ? [800, 1200] : [1200, 630];
  return {
    title: book.title,
    description: cleanDescription(book.description || book.description_bn, "বইআরোতে এই বইটি পড়ুন।"),
    image: coverUrl,
    url: `${SITE_URL}/book/${book.slug}`,
    imageWidth,
    imageHeight,
    ogType: "book",
  };
}

async function buildLiveSessionMeta(id: string) {
  const session = await prisma.liveSession.findUnique({
    where: { id },
    select: {
      show_title: true, description: true, cover_image_url: true,
      station: { select: { name: true, artwork_url: true } },
    },
  });
  if (!session) return null;

  const image = resolveFileUrl(session.cover_image_url) || resolveFileUrl(session.station?.artwork_url ?? null) || FALLBACK_IMAGE;
  return {
    title: session.show_title || "BoiAro On Air",
    description: cleanDescription(session.description, `${session.station?.name || "BoiAro On Air"}-এ এখন সরাসরি সম্প্রচার চলছে।`),
    image,
    url: `${SITE_URL}/live/${id}`,
    imageWidth: 1200,
    imageHeight: 630,
  };
}

async function buildScheduledShowMeta(id: string) {
  const schedule = await prisma.showSchedule.findUnique({
    where: { id },
    select: {
      is_active: true, show_title: true, description: true, cover_image_url: true,
      station: { select: { name: true, artwork_url: true } },
    },
  });
  if (!schedule || !schedule.is_active) return null;

  const image = resolveFileUrl(schedule.cover_image_url) || resolveFileUrl(schedule.station?.artwork_url ?? null) || FALLBACK_IMAGE;
  return {
    title: schedule.show_title,
    description: cleanDescription(schedule.description, `${schedule.station?.name || "BoiAro On Air"}-এর একটি অনুষ্ঠান — সময়সূচী দেখুন।`),
    image,
    url: `${SITE_URL}/schedule/${id}`,
    imageWidth: 1200,
    imageHeight: 630,
  };
}

function buildOnAirHomeMeta() {
  return {
    title: "BoiAro On Air",
    description: "BoiAro On Air-এ সরাসরি রেডিও শুনুন — শো সিডিউল, লাইভ অনুষ্ঠান ও প্রিয় RJ-দের সাথে থাকুন।",
    image: FALLBACK_IMAGE,
    url: `${SITE_URL}/schedule`,
    imageWidth: 1200,
    imageHeight: 630,
  };
}

// req.path is percent-encoded (Express doesn't decode it) — Bengali slugs/ids
// arrive as UTF-8 escape sequences and must be decoded before a DB lookup.
function decodeSegment(raw: string): string | null {
  try { return decodeURIComponent(raw); } catch { return null; }
}

export async function socialBotMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET") return next();

  const ua = req.headers["user-agent"] ?? "";
  if (!BOT_RE.test(ua)) return next();

  try {
    let meta: Awaited<ReturnType<typeof buildBookMeta>> | ReturnType<typeof buildOnAirHomeMeta> | null = null;

    let m: RegExpMatchArray | null;
    if ((m = req.path.match(/^\/book\/([^/?#]+)/))) {
      const slug = decodeSegment(m[1]);
      meta = slug ? await buildBookMeta(slug) : null;
    } else if ((m = req.path.match(/^\/live\/([^/?#]+)/))) {
      const id = decodeSegment(m[1]);
      meta = id ? await buildLiveSessionMeta(id) : null;
    } else if ((m = req.path.match(/^\/schedule\/([^/?#]+)/))) {
      const id = decodeSegment(m[1]);
      meta = id ? await buildScheduledShowMeta(id) : null;
    } else if (req.path === "/schedule" || req.path === "/schedule/") {
      meta = buildOnAirHomeMeta();
    }

    if (!meta) return next();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.send(buildHtml(meta));
  } catch {
    return next();
  }
}
