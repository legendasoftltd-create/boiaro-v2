/**
 * Profile Photo Standard:
 * - Output: 512×512 square (center-cropped)
 * - Format: JPEG (0.85 quality)
 * - Max file size: ~150KB after compression
 * - Accepted input: JPG, PNG, WebP
 */

const TARGET_SIZE = 512;
const JPEG_QUALITY = 0.85;

export async function resizeAndCropAvatar(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Center-crop to square
  const side = Math.min(width, height);
  const sx = Math.round((width - side) / 2);
  const sy = Math.round((height - side) / 2);

  const canvas = new OffscreenCanvas(TARGET_SIZE, TARGET_SIZE);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
