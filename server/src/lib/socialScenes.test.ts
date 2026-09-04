import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderScene } from "./socialScenes.js";

/**
 * The poster requirement is specific: it must be shown prominently, must not
 * be stretched or distorted, and any aspect ratio must produce a clean frame.
 * These assert the pixels, not the intent.
 */
async function solid(w: number, h: number, rgb: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer();
}

const PARAMS = { kind: "live" as const, showTitle: "বই আরও নাইট স্টোরিজ", rjName: "আরজে শুভ্র", stationName: "BoiAro on air" };

describe("live scene with a poster", () => {
  it("always produces a 1920x1080 frame, whatever the poster's shape", async () => {
    for (const [w, h] of [[800, 1200], [1600, 900], [1000, 1000], [2400, 600]]) {
      const out = await renderScene(PARAMS, await solid(w, h, { r: 200, g: 40, b: 40 }));
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height], `${w}x${h}`).toEqual([1920, 1080]);
    }
  });

  it("falls back to the branded card when there is no poster", async () => {
    const out = await renderScene(PARAMS, null);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1920, 1080]);
  });

  it("survives a poster that fails to decode without taking the scene down", async () => {
    // loadPoster returns null on any failure, so the renderer only ever sees
    // a valid buffer or null — but the null path is what keeps a broken image
    // from stopping a broadcast, so it is worth pinning.
    await expect(renderScene(PARAMS, null)).resolves.toBeInstanceOf(Buffer);
  });

  it("does not stretch the poster — a tall image stays tall on screen", async () => {
    // A saturated block on a dark scene: measuring the block's extent tells us
    // the shape it was drawn at. A 2:3 poster drawn into the frame must still
    // be taller than it is wide.
    const out = await renderScene(
      { ...PARAMS, showTitle: "", rjName: "", stationName: "" },
      await solid(800, 1200, { r: 0, g: 255, b: 0 })
    );
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        // the un-blurred poster keeps its pure green; the blurred backdrop is dimmed
        if (data[i + 1] > 200 && data[i] < 80 && data[i + 2] < 80) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const drawnW = maxX - minX + 1;
    const drawnH = maxY - minY + 1;
    expect(drawnW).toBeGreaterThan(0);
    expect(drawnH).toBeGreaterThan(drawnW); // still portrait, not squashed to the box
    // and the ratio still matches the source's 800:1200 within a pixel of rounding
    expect(drawnW / drawnH).toBeCloseTo(800 / 1200, 2);
  });

  it("keeps a wide poster wide", async () => {
    const out = await renderScene(
      { ...PARAMS, showTitle: "", rjName: "", stationName: "" },
      await solid(1600, 400, { r: 0, g: 255, b: 0 })
    );
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i + 1] > 200 && data[i] < 80 && data[i + 2] < 80) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    expect((maxX - minX + 1) / (maxY - minY + 1)).toBeCloseTo(1600 / 400, 1);
  });
});
