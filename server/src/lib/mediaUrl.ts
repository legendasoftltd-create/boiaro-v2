/**
 * Server-side file URL resolver.
 *
 * Rules (applied in order):
 *  1. S3 / CDN absolute URLs              → returned as-is
 *  2. http://localhost or 127.0.0.1 URLs  → host replaced with SERVER_BASE
 *     (handles files uploaded in dev that ended up in a production DB)
 *  3. Relative paths  (/uploads/…)        → prepended with SERVER_BASE
 *  4. null / empty                        → null
 *
 * SERVER_BASE is derived from env vars so it always reflects the current
 * deployment, not whatever hostname was used when the file was first uploaded.
 */

const SERVER_BASE = (
  process.env.BASE_URL ||
  process.env.FRONTEND_URL ||
  `http://localhost:${process.env.PORT || 3001}`
).replace(/\/$/, "");

export function resolveFileUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;

  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const u = new URL(rawUrl);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        return `${SERVER_BASE}${u.pathname}${u.search}`;
      }
    } catch {
      // malformed URL — fall through and return as-is
    }
    return rawUrl; // S3, CDN, or any proper absolute URL
  }

  if (rawUrl.startsWith("/")) {
    return `${SERVER_BASE}${rawUrl}`;
  }

  return rawUrl;
}

/**
 * Resolve all *_url fields on a shallow object.
 * Works for Author, Narrator, Publisher, Profile, Banner, Track, etc.
 * Non-URL fields and nested objects are left untouched.
 */
export function resolveUrls<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (key.endsWith("_url") && (typeof val === "string" || val == null)) {
      out[key] = resolveFileUrl(val as string | null | undefined);
    } else {
      out[key] = val;
    }
  }
  return out as T;
}

/**
 * Resolve all file URLs on a full book object and its nested relations
 * (author, publisher, category, formats → narrator, audiobook_tracks,
 *  contributors).
 *
 * Safe to call with null/undefined — returns the value unchanged.
 */
export function resolveBookUrls(book: any): any {
  if (!book) return book;

  return {
    ...resolveUrls(book),
    author: book.author ? resolveUrls(book.author) : null,
    publisher: book.publisher ? resolveUrls(book.publisher) : null,
    category: book.category ?? null,
    contributors: Array.isArray(book.contributors)
      ? book.contributors.map((c: any) => resolveUrls(c))
      : book.contributors,
    formats: Array.isArray(book.formats)
      ? book.formats.map((fmt: any) => ({
          ...resolveUrls(fmt),
          narrator: fmt.narrator ? resolveUrls(fmt.narrator) : null,
          narrators: fmt.narrators ? resolveUrls(fmt.narrators) : fmt.narrators,
          audiobook_tracks: Array.isArray(fmt.audiobook_tracks)
            ? fmt.audiobook_tracks.map((t: any) => resolveUrls(t))
            : fmt.audiobook_tracks,
        }))
      : book.formats,
  };
}
