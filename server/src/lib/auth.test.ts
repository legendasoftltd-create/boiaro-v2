import { describe, it, expect } from "vitest";
import { isNativePlatform, refreshTtlFor } from "./auth.js";

/**
 * Session policy: the refresh token's life IS the session length, and because
 * every refresh issues a new one, it behaves as an inactivity window rather
 * than a hard cap. App sessions run longer than browser sessions — a phone is
 * a personal device, a browser may be shared.
 */
describe("session lifetime policy", () => {
  it("treats the native app as an app session", () => {
    for (const p of ["android", "ios", "Android", "iOS", "capacitor"]) {
      expect(isNativePlatform(p), p).toBe(true);
      expect(refreshTtlFor(p), p).toBe("90d");
    }
  });

  it("treats the browser as a web session", () => {
    for (const p of ["web", "Web", undefined, null, ""]) {
      expect(isNativePlatform(p as any), String(p)).toBe(false);
      expect(refreshTtlFor(p as any), String(p)).toBe("30d");
    }
  });

  it("gives an unknown platform the shorter web lifetime", () => {
    // Fail safe: anything we don't recognise gets the more conservative window.
    expect(refreshTtlFor("some-new-thing")).toBe("30d");
  });

  it("no longer expires a session after 7 days of use", () => {
    // The old policy was a 7d access token with no renewal, which forced a
    // fresh sign-in every week. Both windows are now far longer than that.
    for (const ttl of [refreshTtlFor("android"), refreshTtlFor("web")]) {
      expect(Number(ttl.replace("d", ""))).toBeGreaterThanOrEqual(30);
    }
  });
});
