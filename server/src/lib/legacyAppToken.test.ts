import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { isLegacyAppUserAgent, accessTokenExpiresInSeconds } from "./auth.js";

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

/**
 * `expires_in` is how a client decides when to renew. It reported a hardcoded
 * constant, so once the legacy app started receiving a 90-day token it was
 * being told it had one hour — which would have kept it re-prompting on the
 * old schedule and quietly undone the fix.
 */
describe("accessTokenExpiresInSeconds", () => {
  const sign = (expiresIn: string) => jwt.sign({ sub: "u" }, "test-secret", { expiresIn } as jwt.SignOptions);

  it("reports 90 days for the legacy app's token", () => {
    expect(accessTokenExpiresInSeconds(sign("90d"))).toBe(90 * 24 * 3600);
  });

  it("reports one hour for everyone else", () => {
    expect(accessTokenExpiresInSeconds(sign("1h"))).toBe(3600);
  });

  it("reads the token rather than a constant, so the two cannot drift", () => {
    expect(accessTokenExpiresInSeconds(sign("7d"))).toBe(7 * 24 * 3600);
  });

  it("falls back instead of throwing on a token it cannot read", () => {
    expect(accessTokenExpiresInSeconds("not-a-jwt")).toBeGreaterThan(0);
  });
});
