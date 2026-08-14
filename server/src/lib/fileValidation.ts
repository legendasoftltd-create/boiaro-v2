// Server-side magic-byte validation for uploads. Multer's fileFilter only
// checks the client-declared Content-Type, which is trivially spoofable by
// anyone calling the API directly (the frontend's own header check in
// src/lib/audioValidation.ts only ever runs in the browser). This is the
// same class of check, run again where it can't be bypassed.
//
// Covers the formats actually accepted by /upload and /upload/media. Any
// mimetype not covered here falls back to trusting multer's mimetype check
// (unchanged from before) rather than blocking unknown-but-allowed types.

function bytesStartWith(buf: Buffer, offset: number, bytes: number[]): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function findAscii(buf: Buffer, needle: string, withinFirst: number): boolean {
  return buf.subarray(0, withinFirst).indexOf(Buffer.from(needle, "ascii")) !== -1;
}

/** Returns true if the buffer's actual content is consistent with the claimed mimetype, or if the mimetype isn't one we know how to sniff (trust multer's check in that case). */
export function verifyFileHeader(buffer: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case "image/jpeg":
      return bytesStartWith(buffer, 0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return bytesStartWith(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return findAscii(buffer, "GIF87a", 6) || findAscii(buffer, "GIF89a", 6) || bytesStartWith(buffer, 0, [0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      return bytesStartWith(buffer, 0, [0x52, 0x49, 0x46, 0x46]) && findAscii(buffer, "WEBP", 16);
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return bytesStartWith(buffer, 0, [0x00, 0x00, 0x01, 0x00]);
    case "image/svg+xml": {
      // SVG is text, not binary-signed — a loose sanity check is the best
      // that's meaningful here (the real SVG risk is script content, not
      // format spoofing, and isn't something a magic-byte check catches).
      const head = buffer.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
      return head.startsWith("<?xml") || head.startsWith("<svg");
    }
    case "application/pdf":
      return findAscii(buffer, "%PDF", 8);
    case "application/epub+zip":
      // EPUB is a zip container — PK\x03\x04 (or the empty/spanned-archive variants)
      return bytesStartWith(buffer, 0, [0x50, 0x4b, 0x03, 0x04]) || bytesStartWith(buffer, 0, [0x50, 0x4b, 0x05, 0x06]) || bytesStartWith(buffer, 0, [0x50, 0x4b, 0x07, 0x08]);
    case "audio/mpeg": {
      const hasId3 = bytesStartWith(buffer, 0, [0x49, 0x44, 0x33]);
      const hasSync = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
      return hasId3 || hasSync;
    }
    case "audio/mp4":
    case "video/mp4": {
      for (let i = 0; i <= Math.min(buffer.length, 64) - 4; i++) {
        if (buffer[i] === 0x66 && buffer[i + 1] === 0x74 && buffer[i + 2] === 0x79 && buffer[i + 3] === 0x70) return true; // "ftyp"
      }
      if (buffer.length >= 8) {
        const firstBox = buffer.subarray(4, 8).toString("ascii");
        if (["mdat", "moov", "free", "skip", "wide", "uuid", "moof"].includes(firstBox)) return true;
      }
      return false;
    }
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave": {
      const isRiff = bytesStartWith(buffer, 0, [0x52, 0x49, 0x46, 0x46]);
      const isWave = findAscii(buffer, "WAVE", 16);
      const isRf64 = bytesStartWith(buffer, 0, [0x52, 0x46, 0x36, 0x34]);
      return (isRiff && isWave) || (isRf64 && isWave);
    }
    default:
      // Not a format we sniff (e.g. audio/aac, audio/opus, video/webm, etc,
      // all legitimately allowed by /upload/media's broader mimetype list) —
      // trust the mimetype filter that already ran, same behavior as before.
      return true;
  }
}
