import crypto from "crypto";

// At-rest encryption for platform secrets stored in plain columns/settings
// (ElevenLabs API key, SMS gateway credentials, Firebase service account
// JSON, SMTP password) — previously all plaintext in the DB. Distinct from
// sms.ts's AES-256-CBC, which encrypts outbound OTP *message content* per
// SSL Wireless's transmission spec, not secrets storage.
//
// Requires no new deployment secret: the key is derived (scrypt) from
// JWT_SECRET, which every environment running this app already has set. An
// operator who wants a dedicated key can set SECRETS_ENCRYPTION_KEY instead.
const PREFIX = "enc:v1:";

function deriveKey(): Buffer {
  const secret = process.env.SECRETS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("Neither SECRETS_ENCRYPTION_KEY nor JWT_SECRET is set — cannot encrypt/decrypt platform secrets");
  return crypto.scryptSync(secret, "boiaro-platform-secrets-v1", 32);
}

/** Encrypts a plaintext secret for at-rest storage (AES-256-GCM). Pass-through for empty input. */
export function encryptSecret(plainText: string | null | undefined): string {
  if (!plainText) return "";
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Decrypts a value encrypted by encryptSecret. Values without the "enc:v1:"
 * prefix are legacy plaintext (written before this existed) and are
 * returned unchanged — no separate backfill migration needed, since the
 * next time that setting is saved through its normal admin mutation it
 * gets encrypted going forward.
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const key = deriveKey();
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("[secretEncryption] failed to decrypt a stored secret:", (err as Error).message);
    return "";
  }
}
