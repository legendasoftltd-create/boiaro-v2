const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * Converts relative media URLs (e.g. /uploads/...) to absolute URLs.
 * Keeps absolute/data/blob URLs unchanged.
 */
export function toMediaUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  if (/^(https?:\/\/|blob:|data:)/i.test(rawUrl)) return rawUrl;

  if (rawUrl.startsWith("/")) {
    if (API_BASE) return `${API_BASE}${rawUrl}`;
    if (typeof window !== "undefined") return `${window.location.origin}${rawUrl}`;
  }

  return rawUrl;
}
