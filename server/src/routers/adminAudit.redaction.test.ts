import { describe, it, expect } from "vitest";
import { redactForAudit } from "./admin.js";

/**
 * Every non-read admin procedure writes its raw input to the audit log. The
 * Social Live connection mutations carry a Facebook/YouTube stream key in
 * that input, and §21 of the brief is explicit that a full stream key must
 * never reach a log.
 *
 * The protection is the field-name pattern in redactForAudit, which is easy
 * to break by renaming a field. This test is here so that rename fails loudly
 * instead of quietly putting a live broadcast credential into audit_log.
 */
describe("admin audit redaction of Social Live credentials", () => {
  it("redacts the stream key from a saved connection", () => {
    const input = {
      platform: "youtube",
      account_name: "BoiAro Official",
      rtmp_url: "rtmps://a.rtmps.youtube.com:443/live2",
      stream_key: "abcd-1234-efgh-5678-ijkl",
      enabled: true,
    };
    const audited = redactForAudit(input) as Record<string, unknown>;

    expect(audited.stream_key).toBe("[redacted]");
    expect(JSON.stringify(audited)).not.toContain("abcd-1234-efgh-5678-ijkl");
    // The non-secret fields still have to survive, or the audit trail stops
    // being useful for answering "who pointed us at which channel".
    expect(audited.account_name).toBe("BoiAro Official");
    expect(audited.rtmp_url).toBe("rtmps://a.rtmps.youtube.com:443/live2");
    expect(audited.platform).toBe("youtube");
  });

  it("redacts the other spellings a credential field might take", () => {
    const audited = redactForAudit({
      streamKey: "abcd-1234-efgh-5678",
      stream_key_encrypted: "enc:v1:whatever",
      apiSecret: "s3cret",
      access_token: "t0ken",
      password: "hunter2",
    }) as Record<string, unknown>;
    for (const field of Object.keys(audited)) {
      expect(audited[field], field).toBe("[redacted]");
    }
  });
});
