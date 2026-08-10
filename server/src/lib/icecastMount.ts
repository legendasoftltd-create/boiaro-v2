/**
 * A RadioStation's stream_url is the *public listening* URL, which is
 * often reverse-proxied (e.g. https://boiaro.com/radio-stream/live.mp3 ->
 * nginx strips /radio-stream and proxies to 127.0.0.1:8000/live.mp3 on the
 * Icecast host) so browsers get HTTPS without exposing Icecast directly.
 * The real Icecast mount name is whatever's left after that prefix is
 * stripped — NOT the full URL path — so anything that needs to talk to
 * Icecast directly (registering a broadcast's mount, matching a listener
 * count sample against a mount) must strip it the same way nginx does, or
 * it silently derives a mount name Icecast never actually uses.
 *
 * Configurable because the prefix is an nginx convention, not an Icecast
 * one — every station is expected to share the same one (that's what
 * makes stripping it well-defined at all).
 */
const PROXY_PREFIX = (process.env.ICECAST_PROXY_PREFIX || "/radio-stream").replace(/\/$/, "");

/** Returns the real Icecast mount path for a station's public stream_url, or null if unparseable. */
export function deriveIcecastMountPath(streamUrl: string | null | undefined): string | null {
  if (!streamUrl) return null;
  let url: URL;
  try {
    url = new URL(streamUrl);
  } catch {
    return null;
  }
  const path = url.pathname;
  if (PROXY_PREFIX && path.startsWith(PROXY_PREFIX + "/")) {
    return path.slice(PROXY_PREFIX.length);
  }
  return path;
}
