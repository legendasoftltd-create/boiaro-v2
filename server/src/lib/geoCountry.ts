import type { Request } from "express";
import geoip from "geoip-lite";

// Resolves the ISO 3166-1 alpha-2 country code for a request.
// Prefers a `CF-IPCountry` header (set by Cloudflare, or any CDN in front that
// mimics it) since that's authoritative and free. Falls back to an offline
// GeoLite2-backed lookup (`geoip-lite`) against the client IP — this app isn't
// currently proxied through Cloudflare (see nginx/api.boiaro.com.conf), so the
// fallback is the common path in production today.
export function detectCountryCode(req: Request): string | null {
  const cfCountry = req.headers["cf-ipcountry"];
  if (typeof cfCountry === "string" && cfCountry.trim() && cfCountry.toUpperCase() !== "XX") {
    return cfCountry.trim().toUpperCase();
  }

  const ip = req.ip;
  if (!ip) return null;

  const lookup = geoip.lookup(ip.replace(/^::ffff:/, ""));
  return lookup?.country ?? null;
}
