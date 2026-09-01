import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Guards the fix for "playing a new audiobook signs you out".
 *
 * httpBatchLink packs several calls into one HTTP request. When the outcomes
 * disagree — one unauthorized, one fine — tRPC answers **207**, not 401, and
 * puts each result in the body. The retry only looked at `res.status === 401`,
 * so it never renewed the session for exactly the request shape that opening a
 * new audiobook produces: a burst of mixed public and protected queries. The
 * UNAUTHORIZED reached AuthContext, which cleared the tokens.
 *
 * Verified against production: a batch of [protected, public] with no token
 * really does return 207 with the UNAUTHORIZED inside the body.
 */
const { batchCarriesAuthError, fetchWithRefresh } = await import("@/lib/trpc");
const { setTokens, getAccessToken } = await import("@/lib/authTokens");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// The exact payload production returned for an unauthorized batched call.
const BATCH_MIXED = [
  { error: { message: "UNAUTHORIZED", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401, path: "content.batchSignedUrls" } } },
  { result: { data: [{ id: "station-1" }] } },
];

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
afterEach(() => vi.unstubAllGlobals());

describe("batchCarriesAuthError", () => {
  it("finds an UNAUTHORIZED buried in a 207 batch", async () => {
    await expect(batchCarriesAuthError(json(207, BATCH_MIXED))).resolves.toBe(true);
  });

  it("ignores a 207 batch whose failures are not auth failures", async () => {
    const body = [{ error: { data: { code: "NOT_FOUND", httpStatus: 404 } } }, { result: { data: 1 } }];
    await expect(batchCarriesAuthError(json(207, body))).resolves.toBe(false);
  });

  it("ignores a fully successful batch", async () => {
    await expect(batchCarriesAuthError(json(200, [{ result: { data: 1 } }]))).resolves.toBe(false);
  });

  it("does not treat an unreadable body as an auth failure", async () => {
    const res = new Response("<html>gateway error</html>", { status: 207 });
    await expect(batchCarriesAuthError(res)).resolves.toBe(false);
  });

  it("leaves the response body readable for the caller", async () => {
    // It clones before reading — consuming the original would break tRPC.
    const res = json(207, BATCH_MIXED);
    await batchCarriesAuthError(res);
    await expect(res.json()).resolves.toEqual(BATCH_MIXED);
  });
});

describe("fetchWithRefresh", () => {
  it("renews and replays when the 401 is hidden inside a 207 batch", async () => {
    setTokens("stale-access", "good-refresh");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        calls.push("refresh");
        return json(200, { access_token: "fresh-access", refresh_token: "fresh-refresh" });
      }
      calls.push(`req:${new Headers(init?.headers).get("Authorization")}`);
      return calls.filter((c) => c.startsWith("req")).length === 1
        ? json(207, BATCH_MIXED)
        : json(200, [{ result: { data: "ok" } }]);
    }));

    const res = await fetchWithRefresh("https://api.test/trpc/x", { headers: {} });

    expect(calls).toEqual(["req:null", "refresh", "req:Bearer fresh-access"]);
    expect(res.status).toBe(200);
    expect(getAccessToken()).toBe("fresh-access");
  });

  it("still handles a plain 401 (every call in the batch unauthorized)", async () => {
    setTokens("stale", "good-refresh");
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      if (String(input).includes("/auth/refresh")) {
        return json(200, { access_token: "fresh", refresh_token: "r2" });
      }
      return ++n === 1 ? json(401, { message: "Unauthorized" }) : json(200, { ok: true });
    }));
    const res = await fetchWithRefresh("https://api.test/trpc/x", {});
    expect(res.status).toBe(200);
  });

  it("does not replay a 207 that carries no auth error", async () => {
    setTokens("a", "r");
    const f = vi.fn(async () => json(207, [{ error: { data: { httpStatus: 404 } } }]));
    vi.stubGlobal("fetch", f);
    const res = await fetchWithRefresh("https://api.test/trpc/x", {});
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(207);
  });

  it("does nothing without a refresh token — a signed-out visitor is not a failure", async () => {
    const f = vi.fn(async () => json(207, BATCH_MIXED));
    vi.stubGlobal("fetch", f);
    await fetchWithRefresh("https://api.test/trpc/x", {});
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("returns the original response when the refresh itself fails", async () => {
    setTokens("a", "dead-refresh");
    vi.stubGlobal("fetch", vi.fn(async (input: any) =>
      String(input).includes("/auth/refresh") ? json(401, {}) : json(207, BATCH_MIXED)));
    const res = await fetchWithRefresh("https://api.test/trpc/x", {});
    expect(res.status).toBe(207);
  });
});
