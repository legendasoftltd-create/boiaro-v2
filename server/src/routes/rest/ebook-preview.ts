import { Router } from "express";
import { getAuthUserFromAuthorizationHeader } from "../../lib/auth.js";
import { prisma } from "../../lib/prisma.js";

export const ebookPreviewRouter = Router();

/**
 * GET /api/v1/ebook-preview?token=<jwt>&url=<encoded-file-url>
 *
 * Admin-only proxy that fetches an ebook/PDF file and serves it with
 * Content-Disposition: inline so it can be displayed in an <iframe>.
 * The token is passed as a query param because iframes cannot send
 * Authorization headers.
 */
ebookPreviewRouter.get("/", async (req, res) => {
  try {
    const token = req.query.token as string | undefined;
    const fileUrl = req.query.url as string | undefined;

    if (!token || !fileUrl) {
      res.status(400).json({ error: "Missing token or url" });
      return;
    }

    // Validate JWT — must be a valid user
    const { userId } = getAuthUserFromAuthorizationHeader(`Bearer ${token}`);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Must be an admin
    const role = await prisma.userRole.findFirst({
      where: { user_id: userId, role: "admin" },
    });
    if (!role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Validate that url is http(s)
    let targetUrl: string;
    try {
      const parsed = new URL(fileUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      targetUrl = parsed.toString();
    } catch {
      res.status(400).json({ error: "Invalid file URL" });
      return;
    }

    // Fetch the file from its origin (S3 or local server)
    const upstream = await fetch(targetUrl);
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Failed to fetch file" });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=300");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err: any) {
    res.status(500).json({ error: "Preview failed" });
  }
});
