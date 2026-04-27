import { describe, it, expect, vi } from "vitest";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_FILE_INPUT,
  DEFAULT_MAX_AUDIO_FILE_SIZE,
  DEFAULT_MAX_VIDEO_FILE_SIZE,
  sanitizeTrackTitle,
  validateMediaFile,
} from "@/lib/audioValidation";

// Helper to create a fake File
function createFakeFile(name: string, sizeBytes: number, type = ""): File {
  const data = new Uint8Array(sizeBytes);
  return new File([data], name, { type });
}

describe("audioValidation", () => {
  describe("ACCEPTED_EXTENSIONS", () => {
    it("includes mp3, m4a, mp4", () => {
      expect(ACCEPTED_EXTENSIONS).toContain("mp3");
      expect(ACCEPTED_EXTENSIONS).toContain("m4a");
      expect(ACCEPTED_EXTENSIONS).toContain("mp4");
    });

    it("does not include unsupported formats", () => {
      expect(ACCEPTED_EXTENSIONS).not.toContain("wav");
      expect(ACCEPTED_EXTENSIONS).not.toContain("ogg");
      expect(ACCEPTED_EXTENSIONS).not.toContain("flac");
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
    it("audio limit is 100MB", () => {
      expect(DEFAULT_MAX_AUDIO_FILE_SIZE).toBe(100 * 1024 * 1024);
    });
    it("video limit is 500MB", () => {
      expect(DEFAULT_MAX_VIDEO_FILE_SIZE).toBe(500 * 1024 * 1024);
    });
  });

  describe("validateMediaFile — format rejection", () => {
    it("rejects .wav files", async () => {
      const file = createFakeFile("track.wav", 1024);
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("Unsupported format");
        expect(result.error).toContain("MP3, M4A, MP4");
      }
    });

    it("rejects .ogg files", async () => {
      const file = createFakeFile("track.ogg", 1024);
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
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
    it("rejects MP3 over 100MB", async () => {
      const file = createFakeFile("big.mp3", 101 * 1024 * 1024, "audio/mpeg");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
        expect(result.error).toContain("100MB");
      }
    });

    it("rejects M4A over 100MB", async () => {
      const file = createFakeFile("big.m4a", 101 * 1024 * 1024, "audio/mp4");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
      }
    });

    it("rejects MP4 over 500MB", async () => {
      const file = createFakeFile("big.mp4", 501 * 1024 * 1024, "video/mp4");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
        expect(result.error).toContain("500MB");
      }
    });

    it("applies different limits for audio vs video", async () => {
      // 200MB MP3 should fail (100MB limit)
      const mp3 = createFakeFile("medium.mp3", 200 * 1024 * 1024, "audio/mpeg");
      const mp3Result = await validateMediaFile(mp3);
      expect(mp3Result.valid).toBe(false);

      // 200MB MP4 should pass size check (500MB limit) — will fail on header
      const mp4 = createFakeFile("medium.mp4", 200 * 1024 * 1024, "video/mp4");
      const mp4Result = await validateMediaFile(mp4);
      if (mp4Result.valid === false) {
        // Should NOT fail on size — should fail on header or duration
        expect(mp4Result.error).not.toContain("too large");
      }
    });

    it("respects custom maxSizeBytes override", async () => {
      const file = createFakeFile("small.mp3", 1000, "audio/mpeg");
      const result = await validateMediaFile(file, { maxSizeBytes: 500 });
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("too large");
      }
    });
  });

  describe("validateMediaFile — header validation in jsdom", () => {
    // In jsdom, file.slice().arrayBuffer() returns zero-filled bytes
    // so header checks will reject — this verifies header validation IS enforced
    it("rejects MP3 with invalid header (zero bytes)", async () => {
      const file = createFakeFile("fake.mp3", 5000, "audio/mpeg");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("file signature");
      }
    });

    it("rejects M4A with invalid header (zero bytes)", async () => {
      const file = createFakeFile("fake.m4a", 5000, "audio/mp4");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("file signature");
      }
    });

    it("rejects MP4 with invalid header (zero bytes)", async () => {
      const file = createFakeFile("fake.mp4", 5000, "video/mp4");
      const result = await validateMediaFile(file);
      expect(result.valid).toBe(false);
      if (result.valid === false) {
        expect(result.error).toContain("file signature");
      }
    });
  });
});
