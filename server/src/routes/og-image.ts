import express from "express";
import sharp from "sharp";
import path from "path";
import fs from "fs";

const BG = { r: 255, g: 255, b: 255, alpha: 255 } as const;  // white
const GOLD = { r: 217, g: 166, b: 38, alpha: 255 } as const; // hsl(43 70% 50%)

export function registerOgImageRoute(app: express.Application, distDir: string) {
  app.get("/og-image.png", async (req, res) => {
    const logoPath = path.join(distDir, "logo.png");

    let logoStat: fs.Stats;
    try {
      logoStat = fs.statSync(logoPath);
    } catch {
      res.status(404).json({ error: "Logo not found" });
      return;
    }

    // ETag keyed to logo mtime — stale cache auto-invalidates when logo file changes
    const etag = `"og-${logoStat.mtimeMs.toString(36)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    try {
      const logo = await sharp(logoPath)
        .resize(340, 340, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      const stripe = await sharp({
        create: { width: 1200, height: 6, channels: 4, background: GOLD },
      })
        .png()
        .toBuffer();

      const image = await sharp({
        create: { width: 1200, height: 630, channels: 4, background: BG },
      })
        .composite([
          { input: logo, gravity: "centre" },
          { input: stripe, top: 624, left: 0 },
        ])
        .png({ compressionLevel: 7 })
        .toBuffer();

      res.set({
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        ETag: etag,
      });
      res.send(image);
    } catch (err: any) {
      console.error("[og-image] generation failed:", err?.message);
      res.status(500).json({ error: "Image generation failed" });
    }
  });
}
