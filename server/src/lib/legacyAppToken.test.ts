import { describe, it, expect } from "vitest";
import { isLegacyAppUserAgent } from "./auth.js";

/**
 * The legacy Flutter app is told apart from every other client by its
 * User-Agent, and it is the only client that gets a long access token. Getting
 * this predicate wrong in either direction is costly: too narrow and those
 * users keep being logged out hourly, too broad and a browser silently gets a
 * 7-day token it never needed.
 */
describe("isLegacyAppUserAgent", () => {
  it("matches the Flutter app seen in production", () => {
    expect(isLegacyAppUserAgent("Dart/3.10 (dart:io)")).toBe(true);
  });

  it("matches other Dart runtime versions", () => {
    expect(isLegacyAppUserAgent("Dart/2.19 (dart:io)")).toBe(true);
    expect(isLegacyAppUserAgent("dart/4.0 (dart:io)")).toBe(true);
  });

  it("does NOT match browsers or the Capacitor app, which refresh correctly", () => {
    for (const ua of [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    ]) {
      expect(isLegacyAppUserAgent(ua), ua).toBe(false);
    }
  });

  it("does not match a browser that merely mentions Dart later in the string", () => {
    // Anchored at the start on purpose — "Dart" can appear in a product token.
    expect(isLegacyAppUserAgent("Mozilla/5.0 (compatible; DartBot/1.0)")).toBe(false);
  });

  it("treats a missing or empty User-Agent as not-legacy", () => {
    expect(isLegacyAppUserAgent(undefined)).toBe(false);
    expect(isLegacyAppUserAgent(null)).toBe(false);
    expect(isLegacyAppUserAgent("")).toBe(false);
    expect(isLegacyAppUserAgent("   ")).toBe(false);
  });
});
