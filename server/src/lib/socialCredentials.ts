import { encryptSecret, decryptSecret } from "./secretEncryption.js";

/**
 * Credential handling for Social Live Broadcasting destinations.
 *
 * A Facebook or YouTube stream key is the single most dangerous value in this
 * feature: whoever holds it can broadcast to the Page or channel as BoiAro.
 * So it gets three separate protections, and this module is the only place
 * any of them live:
 *
 *   1. It is encrypted at rest (AES-256-GCM, via secretEncryption.ts).
 *   2. It is never returned by any query, procedure or route — callers get
 *      maskStreamKey() output instead. Decryption happens in exactly one
 *      place: where the encoder builds its ffmpeg argument array.
 *   3. It is validated on the way in, so a malformed or hostile value never
 *      reaches storage at all.
 *
 * On (3): the encoder spawns ffmpeg with an argument array and never a shell
 * string, so shell metacharacters are not a code-execution risk here. The
 * real hazard is *ffmpeg option injection* — a value beginning with "-" that
 * ffmpeg would read as a flag rather than as data. That case is rejected
 * explicitly below rather than being left to the argv boundary alone.
 */

/** Ingest URLs may only ever be RTMP or RTMPS. */
const ALLOWED_PROTOCOLS = new Set(["rtmp:", "rtmps:"]);

/** A conservative hostname: labels of alphanumerics and hyphens, at least one dot. */
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** Ingest paths are plain, e.g. /live2 or /rtmp/live. No spaces, no metacharacters. */
const PATH_RE = /^\/[A-Za-z0-9/_.-]*$/;

/**
 * Stream keys as the two platforms actually issue them: YouTube's
 * dash-grouped alphanumerics, and Facebook's longer keys which can carry
 * query-string parameters. Deliberately excludes whitespace, quotes,
 * backticks, semicolons, pipes and dollar signs — none of which appear in a
 * real key, so accepting them would only ever widen the blast radius.
 */
const STREAM_KEY_RE = /^[A-Za-z0-9_\-.:/?=&~+]{8,512}$/;

const MAX_URL_LENGTH = 512;

export interface ValidationResult {
  ok: boolean;
  /** Present when ok is false — safe to show an admin, never contains the value itself. */
  error?: string;
}

/**
 * Validates an ingest URL. Rejects anything that isn't a plain rtmp(s) URL
 * with a hostname and a simple path — no credentials in the URL, no query
 * string, no fragment.
 */
export function validateRtmpUrl(raw: string): ValidationResult {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Ingest URL is required." };
  if (value.length > MAX_URL_LENGTH) return { ok: false, error: `Ingest URL is too long (max ${MAX_URL_LENGTH} characters).` };
  if (value.startsWith("-")) return { ok: false, error: "Ingest URL cannot start with a dash." };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Ingest URL is not a valid URL." };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, error: "Ingest URL must start with rtmp:// or rtmps://." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Put the stream key in the stream key field, not in the URL." };
  }
  if (!HOSTNAME_RE.test(url.hostname)) {
    return { ok: false, error: "Ingest URL host is not a valid domain name." };
  }
  if (url.port) {
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, error: "Ingest URL port is out of range." };
    }
  }
  if (url.search || url.hash) {
    return { ok: false, error: "Ingest URL cannot contain a query string or fragment." };
  }
  if (!PATH_RE.test(url.pathname)) {
    return { ok: false, error: "Ingest URL path contains characters that are not allowed." };
  }
  return { ok: true };
}

/** Validates a stream key's shape. Never echoes the key back in the error. */
export function validateStreamKey(raw: string): ValidationResult {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Stream key is required." };
  if (value.startsWith("-")) {
    // An argument beginning with "-" would be read by ffmpeg as an option.
    return { ok: false, error: "Stream key cannot start with a dash." };
  }
  if (value.length < 8) return { ok: false, error: "Stream key looks too short to be genuine." };
  if (value.length > 512) return { ok: false, error: "Stream key is too long (max 512 characters)." };
  if (!STREAM_KEY_RE.test(value)) {
    return { ok: false, error: "Stream key contains characters that are not allowed." };
  }
  return { ok: true };
}

/**
 * The only representation of a stream key that may leave the server.
 *
 * Shows enough for an admin to tell two keys apart without showing enough to
 * use one. Short keys are masked completely rather than partially — revealing
 * four of ten characters is a meaningful fraction of a weak key.
 */
export function maskStreamKey(plain: string | null | undefined): string {
  const value = (plain ?? "").trim();
  if (!value) return "";
  const DOTS = "••••••••";
  if (value.length < 16) return DOTS;
  return `${value.slice(0, 4)}${DOTS}${value.slice(-3)}`;
}

/** Encrypts a stream key for storage. Validate before calling. */
export function encryptStreamKey(plain: string): string {
  return encryptSecret(plain.trim());
}

/**
 * Decrypts a stored stream key. Call this only at the point of use — never to
 * populate an API response, a log line or an audit entry.
 */
export function decryptStreamKey(stored: string | null | undefined): string {
  return decryptSecret(stored);
}

/** The masked form of a stored (encrypted) key, for display. */
export function maskStoredStreamKey(stored: string | null | undefined): string {
  return maskStreamKey(decryptSecret(stored));
}

/**
 * Joins a validated ingest URL and stream key into the single argument ffmpeg
 * receives. Re-validates both first: this is the last point before a value
 * becomes part of a process invocation, and a caller that skipped validation
 * should fail here rather than silently spawn something unintended.
 */
export function buildIngestUrl(rtmpUrl: string, streamKey: string): string {
  const urlCheck = validateRtmpUrl(rtmpUrl);
  if (!urlCheck.ok) throw new Error(`Refusing to build an ingest URL: ${urlCheck.error}`);
  const keyCheck = validateStreamKey(streamKey);
  if (!keyCheck.ok) throw new Error(`Refusing to build an ingest URL: ${keyCheck.error}`);

  const base = rtmpUrl.trim().replace(/\/+$/, "");
  const result = `${base}/${streamKey.trim()}`;
  // Belt and braces: whatever happened above, what leaves this function is an
  // rtmp(s) URL, so it can never be read by ffmpeg as an option.
  if (!/^rtmps?:\/\//.test(result)) {
    throw new Error("Refusing to build an ingest URL: result is not an rtmp(s) URL.");
  }
  return result;
}

/**
 * Strips anything key-shaped out of text on its way to a log, an audit entry
 * or an API error. Platform errors quite happily quote the full ingest URL
 * back at you, which would otherwise put the key straight into a log file.
 */
export function redactStreamKeys(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/(rtmps?:\/\/[^\s/]+(?:\/[A-Za-z0-9_.-]*)?)\/\S+/gi, "$1/***REDACTED***");
}
