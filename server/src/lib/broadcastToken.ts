import crypto from "crypto";

const TOKEN_BYTES = 32;

/** Generates a new opaque broadcast token — returns both the plaintext (shown to the RJ once) and its hash (stored). */
export function generateBroadcastToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  return { token, hash: hashBroadcastToken(token) };
}

export function hashBroadcastToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison against a stored hash. */
export function verifyBroadcastToken(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashBroadcastToken(token));
  const stored = Buffer.from(storedHash);
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}
