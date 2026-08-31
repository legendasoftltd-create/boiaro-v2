import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Guards the fix for the auto sign-out.
 *
 * The refresh token was stored at sign-in and never spent, so every session
 * ended when its 7-day access token expired. Just as bad, the session bootstrap
 * signed the user out on ANY error, so a dropped connection or an API restart
 * logged everyone out too.
 */
// jsdom already provides a working localStorage — stubbing it here just fought
// with vi.restoreAllMocks() below. Only fetch needs faking.
const { refreshSession, isAuthError, getAccessToken, setTokens } =
  await import("@/lib/authTokens");

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const okResponse = (body: any) =>
  ({ ok: true, status: 200, json: async () => body } as Response);

describe("refreshSession", () => {
  it("exchanges the refresh token and stores the new pair", async () => {
    setTokens("old-access", "old-refresh");
    vi.stubGlobal("fetch", vi.fn(async () =>
      okResponse({ access_token: "new-access", refresh_token: "new-refresh" })));

    await expect(refreshSession()).resolves.toBe(true);
    expect(getAccessToken()).toBe("new-access");
    expect(localStorage.getItem("refresh_token")).toBe("new-refresh");
  });

  it("does nothing when there is no refresh token", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(refreshSession()).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("clears the session when the server rejects the refresh token", async () => {
    setTokens("a", "bad-refresh");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 } as Response)));
    await expect(refreshSession()).resolves.toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("KEEPS the session when the network fails — a blip must not sign anyone out", async () => {
    setTokens("keep-me", "keep-refresh");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(refreshSession()).resolves.toBe(false);
    expect(getAccessToken()).toBe("keep-me");
  });

  it("KEEPS the session on a 5xx — an API restart must not sign anyone out", async () => {
    setTokens("keep-me", "keep-refresh");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    await expect(refreshSession()).resolves.toBe(false);
    expect(getAccessToken()).toBe("keep-me");
  });

  it("coalesces concurrent refreshes into one request", async () => {
    setTokens("a", "r");
    const f = vi.fn(async () => okResponse({ access_token: "n", refresh_token: "nr" }));
    vi.stubGlobal("fetch", f);
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(results).toEqual([true, true, true]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("isAuthError", () => {
  it("recognises a rejected session", () => {
    expect(isAuthError({ data: { code: "UNAUTHORIZED" } })).toBe(true);
    expect(isAuthError({ data: { httpStatus: 401 } })).toBe(true);
  });

  it("does NOT treat transient failures as a rejected session", () => {
    // These used to end the session — the bare catch signed the user out.
    expect(isAuthError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAuthError({ data: { httpStatus: 500 } })).toBe(false);
    expect(isAuthError({ data: { httpStatus: 503 } })).toBe(false);
    expect(isAuthError({ message: "timeout" })).toBe(false);
  });
});
