/**
 * Builds the right "open this in the app" link for the visitor's platform.
 *
 * - Android: an `intent://` URL. Chrome tries the app package first and — if
 *   it's not installed — automatically follows `browser_fallback_url` to the
 *   Play Store, no JS timing hacks needed.
 * - iOS/other: a plain Universal Link (`https://boiaro.com/...`). If the app
 *   is installed and Associated Domains is configured (see
 *   IOS_APP_LINKS_SETUP.md), iOS intercepts it and opens the app; otherwise
 *   it just loads the web page normally — a soft, non-broken fallback.
 *
 * Requires an already-installed app to have registered for these paths
 * (Android: the App Links intent-filter in AndroidManifest.xml; iOS:
 * Associated Domains) — this only builds the URL, it can't make either
 * platform claim the domain.
 */
export function detectMobilePlatform(): "android" | "ios" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

export function buildContinueInAppUrl(path: string, playStoreUrl?: string): string {
  const platform = detectMobilePlatform();
  const universalUrl = `https://boiaro.com${path.startsWith("/") ? path : `/${path}`}`;
  if (platform === "android" && playStoreUrl) {
    const host = "boiaro.com" + (path.startsWith("/") ? path : `/${path}`);
    return `intent://${host}#Intent;scheme=https;package=com.boiaro.app;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;
  }
  return universalUrl;
}
