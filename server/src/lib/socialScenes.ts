import sharp from "sharp";
import { resolveFileUrl } from "./mediaUrl.js";

/**
 * Branded scenes for Social Live Broadcasting.
 *
 * Rendered with sharp (librsvg) and handed to ffmpeg as finished PNG frames.
 * That split is a hard requirement, not a preference: the production app
 * server runs ffmpeg 4.4.2 built WITHOUT libharfbuzz, so its drawtext filter
 * cannot shape Bengali conjuncts correctly, while the media server's 6.1.1
 * can. A drawtext-based scene would render correctly on one host and produce
 * broken glyphs on the other — a bug invisible in local development. Text
 * goes through the same path as the share cards (lib/shareCard.ts), which is
 * already proven correct on both boxes.
 *
 * Scenes are swapped mid-broadcast by writing a different PNG into the
 * encoder's frame pipe (see socialEncoder.ts).
 */

export type SceneKind = "starting_soon" | "live" | "brb" | "ended";

const W = 1920;
const H = 1080;

/** The area a poster is fitted inside. Never exceeded, never cropped. */
const POSTER_BOX = { w: 760, h: 820, cx: 1360, cy: 552 };

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
}

/**
 * Fetches a poster once per broadcast. Returns null on any failure — a
 * missing or unreachable image degrades the scene's looks and must never be
 * able to stop a broadcast from starting.
 */
export async function loadPoster(posterUrl: string | null | undefined): Promise<Buffer | null> {
  const resolved = resolveFileUrl(posterUrl ?? null);
  if (!resolved) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(resolved, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    // Normalise to PNG up front so an odd source format (or an animated GIF)
    // cannot surprise the compositor mid-render.
    return await sharp(raw).png().toBuffer();
  } catch {
    return null;
  }
}

/** Contain-fit: the largest size inside the box that keeps the original ratio. */
function containFit(srcW: number, srcH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / srcW, boxH / srcH);
  return { w: Math.max(1, Math.round(srcW * scale)), h: Math.max(1, Math.round(srcH * scale)) };
}

/**
 * Renders one 1920x1080 scene.
 *
 * With a poster, the frame becomes: a heavily blurred, darkened copy of the
 * poster as the background — which always matches whatever image is supplied,
 * whatever its aspect ratio — the poster itself fitted (never cropped, never
 * stretched) on the right, and the show identity on the left.
 */
export async function renderScene(params: SceneParams, poster?: Buffer | null): Promise<Buffer> {
  const spec = SCENE[params.kind];
  const title = escapeXml(truncate((params.showTitle || "BoiAro On Air").trim(), poster ? 30 : 42));
  const rj = params.rjName ? escapeXml(truncate(params.rjName.trim(), 26)) : "";
  const station = params.stationName ? escapeXml(truncate(params.stationName.trim(), 26)) : "";

  // ── no poster: the original branded card, unchanged ────────────────────
  if (!poster) {
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#141109"/><stop offset="100%" stop-color="#2b2213"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${spec.accent}"/>
  <circle cx="164" cy="150" r="14" fill="${spec.accent}"/>
  <text x="194" y="162" font-family="${FONT}" font-size="32" fill="${spec.accent}" font-weight="700">${escapeXml(spec.label)}</text>
  ${spec.badge ? badgeSvg(spec.accent, spec.badge) : ""}
  <text x="150" y="540" font-family="${FONT}" font-size="82" fill="#ffffff" font-weight="700">${title}</text>
  ${rj ? `<text x="150" y="626" font-family="${FONT}" font-size="40" fill="#c9c2b3">${rj}</text>` : ""}
  ${station ? `<text x="150" y="${rj ? 692 : 626}" font-family="${FONT}" font-size="32" fill="#8a8371">${station}</text>` : ""}
  <text x="150" y="${H - 108}" font-family="${FONT}" font-size="44" fill="${spec.accent}" font-weight="700">BoiAro</text>
  <text x="150" y="${H - 60}" font-family="${FONT}" font-size="26" fill="#6b645c">boiaro.com</text>
</svg>`;
    return sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
  }

  // ── with a poster ──────────────────────────────────────────────────────
  const meta = await sharp(poster).metadata();
  const fit = containFit(meta.width || 1000, meta.height || 1000, POSTER_BOX.w, POSTER_BOX.h);
  const left = Math.round(POSTER_BOX.cx - fit.w / 2);
  const top = Math.round(POSTER_BOX.cy - fit.h / 2);

  const [background, fitted] = await Promise.all([
    // The clean fill: the poster itself, blurred past recognition and dimmed,
    // so any aspect ratio produces a background that belongs with the image
    // instead of a flat bar down the side.
    sharp(poster)
      .resize(W, H, { fit: "cover", position: "attention" })
      .blur(60)
      .modulate({ brightness: 0.32, saturation: 0.7 })
      .toBuffer(),
    sharp(poster).resize(fit.w, fit.h, { fit: "inside" }).png().toBuffer(),
  ]);

  // A scrim behind the text column keeps Bengali legible over any artwork.
  const scrim = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="left" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d0b07" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="#0d0b07" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0d0b07" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#left)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${spec.accent}"/>
</svg>`;

  // Drawn at the poster's computed position, so the frame always hugs the
  // image regardless of its shape.
  const frame = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${left - 6}" y="${top - 6}" width="${fit.w + 12}" height="${fit.h + 12}" rx="10"
        fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3"/>
</svg>`;

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="164" cy="150" r="14" fill="${spec.accent}"/>
  <text x="194" y="162" font-family="${FONT}" font-size="32" fill="${spec.accent}" font-weight="700">${escapeXml(spec.label)}</text>
  ${spec.badge ? badgeSvg(spec.accent, spec.badge) : ""}
  <text x="150" y="516" font-family="${FONT}" font-size="70" fill="#ffffff" font-weight="700">${title}</text>
  ${rj ? `<text x="150" y="594" font-family="${FONT}" font-size="38" fill="#d8d2c6">${rj}</text>` : ""}
  ${station ? `<text x="150" y="${rj ? 654 : 594}" font-family="${FONT}" font-size="30" fill="#a49c90">${station}</text>` : ""}
  <text x="150" y="${H - 108}" font-family="${FONT}" font-size="44" fill="${spec.accent}" font-weight="700">BoiAro</text>
  <text x="150" y="${H - 60}" font-family="${FONT}" font-size="26" fill="#8a8371">boiaro.com</text>
</svg>`;

  return sharp(background)
    .composite([
      { input: Buffer.from(scrim), top: 0, left: 0 },
      { input: fitted, top, left },
      { input: Buffer.from(frame), top: 0, left: 0 },
      { input: Buffer.from(overlay), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

function badgeSvg(accent: string, label: string): string {
  return `<rect x="${W - 268}" y="118" width="148" height="64" rx="32" fill="${accent}"/>
    <text x="${W - 194}" y="161" text-anchor="middle" font-family="Noto Sans, DejaVu Sans" font-size="30" fill="#ffffff" font-weight="700" letter-spacing="2">${label}</text>`;
}

/** Pre-renders all four scenes for a broadcast, so switching is instant. */
export async function renderSceneSet(
  params: Omit<SceneParams, "kind"> & { posterUrl?: string | null }
): Promise<Record<SceneKind, Buffer>> {
  const poster = await loadPoster(params.posterUrl);
  const kinds: SceneKind[] = ["starting_soon", "live", "brb", "ended"];
  const rendered = await Promise.all(kinds.map((kind) => renderScene({ ...params, kind }, poster)));
  return { starting_soon: rendered[0], live: rendered[1], brb: rendered[2], ended: rendered[3] };
}
