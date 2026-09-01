import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("./prisma.js", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

const { isSessionRevoked, bustRevocationCache } = await import("./sessionRevocation.js");

const SECOND = 1000;
const iatOf = (ms: number) => Math.floor(ms / SECOND);

let uid = 0;
const newUser = () => `user-${++uid}`;

beforeEach(() => findUnique.mockReset());

/**
 * This check is what makes a long-lived access token safe. The legacy mobile
 * app's token lasts 90 days, so without it a password change or "sign out
 * from all devices" would not reach that device for three months.
 */
describe("isSessionRevoked", () => {
  it("lets a token through when the user has never revoked anything", async () => {
    const u = newUser();
    findUnique.mockResolvedValue({ sessions_valid_from: null });
    await expect(isSessionRevoked(u, iatOf(Date.now()))).resolves.toBe(false);
  });

  it("rejects a token issued before the revoke", async () => {
    const u = newUser();
    const revokedAt = Date.now();
    findUnique.mockResolvedValue({ sessions_valid_from: new Date(revokedAt) });
    await expect(isSessionRevoked(u, iatOf(revokedAt - 60 * SECOND))).resolves.toBe(true);
  });

  it("lets through a token issued after the revoke — signing back in must work", async () => {
    const u = newUser();
    const revokedAt = Date.now();
    findUnique.mockResolvedValue({ sessions_valid_from: new Date(revokedAt) });
    await expect(isSessionRevoked(u, iatOf(revokedAt + 60 * SECOND))).resolves.toBe(false);
  });

  it("rejects a token with no iat once a revoke exists — an unplaceable token is not trusted", async () => {
    const u = newUser();
    findUnique.mockResolvedValue({ sessions_valid_from: new Date() });
    await expect(isSessionRevoked(u, undefined)).resolves.toBe(true);
  });

  it("compares JWT seconds against millisecond timestamps correctly", async () => {
    // Mixing the units up would make every token look older (or newer) than
    // every revoke — the bug this asserts against.
    const u = newUser();
    const revokedAt = 1_800_000_000_000; // ms
    findUnique.mockResolvedValue({ sessions_valid_from: new Date(revokedAt) });
    await expect(isSessionRevoked(u, iatOf(revokedAt) - 1)).resolves.toBe(true);
    bustRevocationCache(u);
    findUnique.mockResolvedValue({ sessions_valid_from: new Date(revokedAt) });
    await expect(isSessionRevoked(u, iatOf(revokedAt) + 1)).resolves.toBe(false);
  });

  it("caches, so this does not hit the database on every request", async () => {
    const u = newUser();
    findUnique.mockResolvedValue({ sessions_valid_from: null });
    await isSessionRevoked(u, iatOf(Date.now()));
    await isSessionRevoked(u, iatOf(Date.now()));
    await isSessionRevoked(u, iatOf(Date.now()));
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-reads immediately after a revoke busts the cache", async () => {
    const u = newUser();
    findUnique.mockResolvedValue({ sessions_valid_from: null });
    const iat = iatOf(Date.now());
    await expect(isSessionRevoked(u, iat)).resolves.toBe(false);

    bustRevocationCache(u);
    findUnique.mockResolvedValue({ sessions_valid_from: new Date(Date.now() + 60 * SECOND) });
    await expect(isSessionRevoked(u, iat)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("treats a missing user as not revoked rather than locking them out", async () => {
    const u = newUser();
    findUnique.mockResolvedValue(null);
    await expect(isSessionRevoked(u, iatOf(Date.now()))).resolves.toBe(false);
  });
});
