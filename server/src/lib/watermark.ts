import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Works in both dev (src/lib/) and prod (dist/lib/) because the build script
// copies src/assets → dist/assets.
const LOGO_PATH = path.resolve(__dirname, "../assets/watermark_logo.png");

const LOGO_OPACITY  = 0.65;   // 65% opacity — visible but not distracting
const LOGO_WIDTH_RATIO = 0.22; // logo = 22% of image width
const LOGO_MIN_PX  = 60;
const LOGO_MAX_PX  = 220;
const PADDING_RIGHT_PX  = 50;
const PADDING_BOTTOM_PX = 100;

/**
 * Composite the BoiAro logo watermark onto the bottom-right corner of a
 * book cover image. Returns the watermarked image as a JPEG buffer.
 *
 * Only applies when uploading book covers (type === "cover").
 */
export async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const imgW  = meta.width  || 800;
  const imgH  = meta.height || 800;

  // Compute target logo width, keeping aspect ratio (original: 478 × 163)
  const rawW   = Math.round(imgW * LOGO_WIDTH_RATIO);
  const logoW  = Math.max(LOGO_MIN_PX, Math.min(LOGO_MAX_PX, rawW));
  const logoH  = Math.round(logoW * (163 / 478));

  // Resize the logo
  const logoResized = await sharp(LOGO_PATH)
    .resize(logoW, logoH, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .toBuffer();

  // Apply opacity by using dest-in with a solid-color tile at the desired alpha
  // dest-in: result_alpha = dest_alpha * (src_alpha / 255)
  const alphaValue = Math.round(LOGO_OPACITY * 255); // e.g. 166 for 65%
  const logoWithOpacity = await sharp(logoResized)
    .composite([{
      input: Buffer.from([255, 255, 255, alphaValue]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: "dest-in",
    }])
    .png()
    .toBuffer();

  // Get actual logo dimensions after resize (may differ from logoW/logoH due to fit)
  const logoMeta = await sharp(logoWithOpacity).metadata();
  const finalW = logoMeta.width  || logoW;
  const finalH = logoMeta.height || logoH;

  // Place at bottom-right with specified offsets from each edge
  const left = Math.max(0, imgW - finalW - PADDING_RIGHT_PX);
  const top  = Math.max(0, imgH - finalH - PADDING_BOTTOM_PX);

  return sharp(imageBuffer)
    .composite([{ input: logoWithOpacity, left, top, blend: "over" }])
    .jpeg({ quality: 90, mozjpeg: false })
    .toBuffer();
}
