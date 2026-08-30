import { describe, it, expect, vi } from "vitest";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_FILE_INPUT,
  DEFAULT_MAX_AUDIO_FILE_SIZE,
  DEFAULT_MAX_VIDEO_FILE_SIZE,
  sanitizeTrackTitle,
  validateMediaFile,
} from "@/lib/audioValidation";

// Helper to create a fake File (zero-filled — fails header validation)
function createFakeFile(name: string, sizeBytes: number, type = ""): File {
  const data = new Uint8Array(sizeBytes);
  return new File([data], name, { type });
}

/**
 * Same size, but with a real magic-byte header for the extension, so the file
 * reaches whichever check the test is actually about. Zero-filled files fail
 * header validation first, which made the size-enforcement tests below assert
 * against the header error instead of the size error.
 */
function createValidHeaderFile(name: string, sizeBytes: number, type = ""): File {
  const data = new Uint8Array(sizeBytes);
  const ext = name.split(".").pop()!.toLowerCase();
  if (ext === "mp3") {
    data.set([0x49, 0x44, 0x33], 0); // "ID3"
  } else if (ext === "m4a" || ext === "mp4") {
    data.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp" at the standard offset
  } else if (ext === "wav") {
    data.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    data.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  }
  return new File([data], name, { type });
}

describe("audioValidation", () => {
  describe("ACCEPTED_EXTENSIONS", () => {
    it("includes mp3, m4a, mp4", () => {
      expect(ACCEPTED_EXTENSIONS).toContain("mp3");
      expect(ACCEPTED_EXTENSIONS).toContain("m4a");
      expect(ACCEPTED_EXTENSIONS).toContain("mp4");
    });

    it("includes wav (uncompressed masters are accepted)", () => {
      expect(ACCEPTED_EXTENSIONS).toContain("wav");
    });

    it("does not include unsupported formats", () => {
      expect(ACCEPTED_EXTENSIONS).not.toContain("ogg");
      expect(ACCEPTED_EXTENSIONS).not.toContain("flac");
      expect(ACCEPTED_EXTENSIONS).not.toContain("aac");
    });
  });

  describe("ACCEPTED_FILE_INPUT", () => {
    it("contains MIME types and extensions for file input", () => {
      expect(ACCEPTED_FILE_INPUT).toContain(".mp3");
      expect(ACCEPTED_FILE_INPUT).toContain(".m4a");
      expect(ACCEPTED_FILE_INPUT).toContain(".mp4");
      expect(ACCEPTED_FILE_INPUT).toContain("audio/mpeg");
      expect(ACCEPTED_FILE_INPUT).toContain("audio/mp4");
      expect(ACCEPTED_FILE_INPUT).toContain("video/mp4");
      expect(ACCEPTED_FILE_INPUT).toContain(".wav");
    });
  });

  describe("sanitizeTrackTitle", () => {
    it("removes extension", () => {
      expect(sanitizeTrackTitle("episode-01.mp3")).toBe("episode 01");
    });
    it("replaces dashes and underscores with spaces", () => {
      expect(sanitizeTrackTitle("my_cool-track.m4a")).toBe("my cool track");
    });
    it("trims whitespace", () => {
      expect(sanitizeTrackTitle("  hello_world.mp4  ")).toBe("hello world");
    });
    it("handles nested extensions", () => {
      expect(sanitizeTrackTitle("file.backup.mp3")).toBe("file.backup");
    });
  });

  describe("size limits", () => {
    // Both limits were raised to 1 GB when WAV (uncompressed) was accepted.
    it("audio limit is 1GB", () => {
      expect(DEFAULT_MAX_AUDIO_FILE_SIZE).toBe(1024 * 1024 * 1024);
    });
    it("video limit is 1GB", () => {
      expect(DEFAULT_MAX_VIDEO_FILE_SIZE).toBe(1024 * 1024 * 1024);
    });
  });

  describe("validateMediaFile — format rejection", () => {
    it("rejects .ogg files with an unsupported-format error", async () => {
      const file = createFakeFile("track.ogg", 1024);
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("Unsupported format");
        expect(result.error).toContain("MP3, M4A, WAV, MP4");
      }
    });

    it("does not reject .wav on format (it is an accepted extension)", async () => {
      const file = createFakeFile("track.wav", 1024);
      const result = await validateMediaFile(file);
      // Zero-filled, so it still fails — but on the header, not the format.
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).not.toContain("Unsupported format");
      }
    });

    it("rejects .flac files", async () => {
      const file = createFakeFile("track.flac", 1024);
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
    });

    it("rejects files with no extension", async () => {
      const file = createFakeFile("noext", 1024);
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateMediaFile — size enforcement", () => {
    // These use valid headers so they reach the size check. With zero-filled
    // files they failed on the header first and never exercised size at all.
    const OVER_LIMIT = 1024 * 1024 * 1024 + 1; // 1 GB + 1 byte

    it("rejects MP3 over the 1GB limit", async () => {
      const file = createValidHeaderFile("big.mp3", OVER_LIMIT, "audio/mpeg");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
        expect(result.error).toContain("1024MB");
      }
    });

    it("rejects M4A over the 1GB limit", async () => {
      const file = createValidHeaderFile("big.m4a", OVER_LIMIT, "audio/mp4");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
      }
    });

    it("rejects MP4 over the 1GB limit", async () => {
      const file = createValidHeaderFile("big.mp4", OVER_LIMIT, "video/mp4");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
      }
    });

    it("applies the same limit to audio and video", async () => {
      // 200MB is under the limit for both — neither may fail on size.
      const mp3 = createValidHeaderFile("medium.mp3", 200 * 1024 * 1024, "audio/mpeg");
      const mp3Result = await validateMediaFile(mp3);
      if (mp3Result.valid === false) expect(mp3Result.error).not.toContain("too large");

      const mp4 = createValidHeaderFile("medium.mp4", 200 * 1024 * 1024, "video/mp4");
      const mp4Result = await validateMediaFile(mp4);
      if (mp4Result.valid === false) expect(mp4Result.error).not.toContain("too large");
    });

    it("respects custom maxSizeBytes override", async () => {
      const file = createValidHeaderFile("small.mp3", 1000, "audio/mpeg");
      const result = await validateMediaFile(file, { maxSizeBytes: 500 });
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
      }
    });

    it("checks size before reading the file header", async () => {
      // Order matters: an oversized file must be rejected on size even when its
      // header is unreadable, so we never buffer a huge bogus upload.
      const file = createFakeFile("huge.mp3", OVER_LIMIT, "audio/mpeg");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) expect(result.error).toContain("too large");
    });
  });

  describe("validateMediaFile — header validation in jsdom", () => {
    // In jsdom, a zero-filled File has no valid magic bytes, so these verify
    // that header validation is actually enforced (and not silently skipped).
    for (const [name, type] of [
      ["fake.mp3", "audio/mpeg"],
      ["fake.m4a", "audio/mp4"],
      ["fake.mp4", "video/mp4"],
      ["fake.wav", "audio/wav"],
    ] as const) {
      it(`rejects ${name} with an invalid header`, async () => {
        const result = await validateMediaFile(createFakeFile(name, 5000, type));
        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.error).toContain("not a recognised");
        }
      });
    }

    it("accepts a file whose header matches its extension", async () => {
      const result = await validateMediaFile(createValidHeaderFile("real.mp3", 5000, "audio/mpeg"));
      // Duration is best-effort in jsdom, so validity is what matters here.
      expect(result.valid).toBe(true);
    });
  });
});
