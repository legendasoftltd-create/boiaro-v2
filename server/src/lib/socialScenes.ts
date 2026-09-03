import sharp from "sharp";
import { resolveFileUrl } from "./mediaUrl.js";

/**
 * Branded scenes for Social Live Broadcasting.
 *
 * Rendered with sharp (librsvg) and handed to ffmpeg as finished PNG frames.
 * That split is a hard requirement, not a preference: the production app
 * server runs ffmpeg 4.4.2 built WITHOUT libharfbuzz, so its drawtext filter
 * cannot shape Bengali conjuncts correctly, while the media server's 6.1.1
 * can. A drawtext-based scene would therefore render correctly on one host
 * and produce broken glyphs on the other — a bug invisible in local
 * development. Text goes through the same path as the share cards
 * (lib/shareCard.ts), which is already proven correct on both boxes.
 *
 * Scenes are swapped mid-broadcast by writing a different PNG into the
 * encoder's frame pipe (see socialEncoder.ts). Verified empirically: an
 * image passed with `-loop 1` is decoded once and re-reading the file does
 * nothing, so the pipe is what makes a live switch possible without dropping
 * the RTMP connection.
 */

export type SceneKind = "starting_soon" | "live" | "brb" | "ended";

const W = 1920;
const H = 1080;

const SCENE: Record<SceneKind, { label: string; accent: string; badge: string | null }> = {
  starting_soon: { label: "শুরু হচ্ছে", accent: "#d9a626", badge: null },
  live: { label: "সরাসরি সম্প্রচার", accent: "#e0503a", badge: "LIVE" },
  brb: { label: "একটু পরেই ফিরছি", accent: "#d9a626", badge: null },
  ended: { label: "অনুষ্ঠান শেষ", accent: "#6b645c", badge: null },
};

const FONT = "Noto Sans Bengali, Noto Sans, DejaVu Sans";

/**
 * Show titles and RJ names are user-controlled and get interpolated into an
 * SVG string — unescaped, a title containing `<` or `&` breaks the parse (or
 * worse). Same guard as shareCard.ts.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface SceneParams {
  kind: SceneKind;
  showTitle?: string | null;
  rjName?: string | null;
  stationName?: string | null;
  /** Show cover art. Fetched once per broadcast and reused for every scene. */
  coverUrl?: string | null;
}

/**
 * Fetches and squares off the show cover. Returns null on any failure — a
 * missing or unreachable cover degrades the scene's looks, and must never be
 * able to stop a broadcast from starting.
 */
export async function loadCover(coverUrl: string | null | undefined): Promise<Buffer | null> {
  const resolved = resolveFileUrl(coverUrl ?? null);
  if (!resolved) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(resolved, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    return await sharp(raw).resize(520, 520, { fit: "cover" }).png().toBuffer();
  } catch {
    return null;
  }
}

/** Renders one 1920x1080 scene. `cover` comes from loadCover(). */
export async function renderScene(params: SceneParams, cover?: Buffer | null): Promise<Buffer> {
  const spec = SCENE[params.kind];
  const title = escapeXml(truncate((params.showTitle || "BoiAro On Air").trim(), 42));
  const rj = params.rjName ? escapeXml(truncate(params.rjName.trim(), 34)) : "";
  const station = params.stationName ? escapeXml(truncate(params.stationName.trim(), 34)) : "";
  const hasCover = Boolean(cover);
  const textX = hasCover ? 150 : 150;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#141109"/>
      <stop offset="100%" stop-color="#2b2213"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${spec.accent}"/>
      <stop offset="100%" stop-color="${spec.accent}" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="url(#accent)"/>

  <!-- state label -->
  <circle cx="${textX + 14}" cy="150" r="14" fill="${spec.accent}"/>
  <text x="${textX + 44}" y="162" font-family="${FONT}" font-size="32" fill="${spec.accent}" font-weight="700">${escapeXml(spec.label)}</text>

  ${spec.badge
      ? `<rect x="${W - 260}" y="118" width="140" height="62" rx="31" fill="${spec.accent}"/>
         <text x="${W - 190}" y="160" text-anchor="middle" font-family="Noto Sans, DejaVu Sans" font-size="30" fill="#ffffff" font-weight="700" letter-spacing="2">${spec.badge}</text>`
      : ""}

  <!-- show identity -->
  <text x="${textX}" y="${hasCover ? 560 : 540}" font-family="${FONT}" font-size="82" fill="#ffffff" font-weight="700">${title}</text>
  ${rj ? `<text x="${textX}" y="${hasCover ? 646 : 626}" font-family="${FONT}" font-size="40" fill="#c9c2b3">${rj}</text>` : ""}
  ${station ? `<text x="${textX}" y="${hasCover ? (rj ? 712 : 646) : rj ? 692 : 626}" font-family="${FONT}" font-size="32" fill="#8a8371">${station}</text>` : ""}

  <!-- branding -->
  <text x="${textX}" y="${H - 108}" font-family="${FONT}" font-size="44" fill="${spec.accent}" font-weight="700">BoiAro</text>
  <text x="${textX}" y="${H - 60}" font-family="${FONT}" font-size="26" fill="#6b645c">boiaro.com</text>
</svg>`;

  const base = sharp(Buffer.from(svg)).png();
  if (!cover) return base.toBuffer();

  // Cover sits on the right, clear of the text column.
  return base
    .composite([{ input: cover, top: 280, left: W - 520 - 150 }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/** Pre-renders all four scenes for a broadcast, so switching is instant. */
export async function renderSceneSet(
  params: Omit<SceneParams, "kind">
): Promise<Record<SceneKind, Buffer>> {
  const cover = await loadCover(params.coverUrl);
  const kinds: SceneKind[] = ["starting_soon", "live", "brb", "ended"];
  const rendered = await Promise.all(kinds.map((kind) => renderScene({ ...params, kind }, cover)));
  return {
    starting_soon: rendered[0],
    live: rendered[1],
    brb: rendered[2],
    ended: rendered[3],
  };
}
