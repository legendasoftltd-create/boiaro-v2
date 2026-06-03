export const DEFAULT_MAX_AUDIO_FILE_SIZE = 500 * 1024 * 1024  // 500 MB — WAV is uncompressed, can be large
export const DEFAULT_MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024

export type MediaType = "audio" | "video"

interface ValidationOptions {
  maxSizeBytes?: number
}

export interface ValidatedMediaFile {
  file: File
  durationSeconds: number
  durationLabel: string
  mediaType: MediaType
  mimeType: string
}

const ACCEPTED_FORMATS: Record<string, { mimeType: string; mediaType: MediaType }> = {
  mp3: { mimeType: "audio/mpeg",  mediaType: "audio" },
  m4a: { mimeType: "audio/mp4",   mediaType: "audio" },
  wav: { mimeType: "audio/wav",   mediaType: "audio" },
  mp4: { mimeType: "video/mp4",   mediaType: "video" },
}

export const ACCEPTED_EXTENSIONS = Object.keys(ACCEPTED_FORMATS)
export const ACCEPTED_FILE_INPUT = Object.entries(ACCEPTED_FORMATS)
  .flatMap(([ext, { mimeType }]) => [`.${ext}`, mimeType])
  .join(",")

export async function validateMediaFile(
  originalFile: File,
  options: ValidationOptions = {}
): Promise<{ valid: true; data: ValidatedMediaFile } | { valid: false; error: string }> {
  const extension = getExtension(originalFile.name)
  const formatInfo = ACCEPTED_FORMATS[extension]

  if (!formatInfo) {
    return { valid: false, error: `${originalFile.name}: Unsupported format. Accepted: ${ACCEPTED_EXTENSIONS.join(", ").toUpperCase()}` }
  }

  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_VIDEO_FILE_SIZE // use 500 MB for all
  if (originalFile.size > maxSizeBytes) {
    const maxMB = Math.round(maxSizeBytes / (1024 * 1024))
    return { valid: false, error: `${originalFile.name}: File too large (max ${maxMB}MB).` }
  }

  const headerValid = await validateFileHeader(originalFile, extension)
  if (!headerValid) {
    return { valid: false, error: `${originalFile.name}: Invalid file — not a recognised ${extension.toUpperCase()} file.` }
  }

  // Duration is best-effort: if we cannot read it (e.g. moov at end of large MP4,
  // non-standard WAV layout) we still allow the upload. The server stores whatever
  // duration we provide; the player resolves the real value from the audio element.
  let durationSeconds = 0
  try {
    const d = await readMediaDurationSeconds(originalFile, formatInfo.mediaType, extension)
    if (Number.isFinite(d) && d > 0) durationSeconds = d
  } catch {
    // non-fatal — upload proceeds with duration "0:00"
  }

  const normalizedFile =
    originalFile.type === formatInfo.mimeType
      ? originalFile
      : new File([originalFile], originalFile.name, {
          type: formatInfo.mimeType,
          lastModified: originalFile.lastModified,
        })

  return {
    valid: true,
    data: {
      file: normalizedFile,
      durationSeconds,
      durationLabel: durationSeconds > 0 ? formatDuration(durationSeconds) : "0:00",
      mediaType: formatInfo.mediaType,
      mimeType: formatInfo.mimeType,
    },
  }
}

/** @deprecated Use validateMediaFile instead */
export async function validateMp3File(
  originalFile: File,
  options: ValidationOptions = {}
): Promise<{ valid: true; data: ValidatedMediaFile } | { valid: false; error: string }> {
  return validateMediaFile(originalFile, options)
}

export function sanitizeTrackTitle(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim()
}

function getExtension(fileName: string): string {
  return (fileName.split(".").pop()?.toLowerCase() || "")
}

async function validateFileHeader(file: File, extension: string): Promise<boolean> {
  try {
    // Read enough bytes to cover all check strategies
    const buffer = await file.slice(0, 64).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    switch (extension) {
      case "mp3": {
        const hasId3  = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
        const hasSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
        return hasId3 || hasSync
      }
      case "m4a":
      case "mp4": {
        // MP4/M4A files should contain an "ftyp" box somewhere in the first 64 bytes.
        // Standard: ftyp at bytes 4-7. Non-standard: may be offset if preceded by a
        // free/skip/wide box. Scan for the 4-byte sequence instead of a fixed position.
        for (let i = 0; i <= bytes.length - 4; i++) {
          if (bytes[i] === 0x66 && bytes[i+1] === 0x74 && bytes[i+2] === 0x79 && bytes[i+3] === 0x70) {
            return true // found "ftyp"
          }
        }
        // Some MP4 files produced by streaming tools start with "mdat" before "moov".
        // Check if the first box type is a known-valid ISO BMFF box.
        if (bytes.length >= 8) {
          const firstBoxType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])
          if (["mdat", "moov", "free", "skip", "wide", "uuid", "moof"].includes(firstBoxType)) {
            return true
          }
        }
        return false
      }
      case "wav": {
        // Standard RIFF/WAVE — bytes 0-3 "RIFF", bytes 8-11 "WAVE"
        const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        const isWave = bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
        if (isRiff && isWave) return true
        // RF64 variant for files > 4 GB: starts with "RF64" + "WAVE"
        const isRf64 = bytes[0] === 0x52 && bytes[1] === 0x46 && bytes[2] === 0x36 && bytes[3] === 0x34
        return isRf64 && isWave
      }
      default:
        return false
    }
  } catch {
    return false
  }
}

/**
 * Read WAV duration from binary header.
 * Browser <audio> returns Infinity for large WAV because WAV has no seekable index.
 * Falls back to the browser element if header parsing fails, then to 0.
 */
async function readWavDurationSeconds(file: File): Promise<number> {
  // Try header-based calculation first (most reliable for large files)
  try {
    const headerBytes = Math.min(file.size, 1024) // scan up to 1 KB for chunks
    const buf = await file.slice(0, headerBytes).arrayBuffer()
    const v = new DataView(buf)

    // Accept both RIFF and RF64
    const sig = v.getUint32(0, false)
    if (sig !== 0x52494646 && sig !== 0x52463634) throw new Error("Not RIFF/RF64")
    if (v.getUint32(8, false) !== 0x57415645) throw new Error("Not WAVE")

    let byteRate = 0
    let offset = 12

    while (offset + 8 <= headerBytes) {
      const id   = v.getUint32(offset, false)
      const size = v.getUint32(offset + 4, true)

      if (id === 0x666D7420 /* "fmt " */) {
        if (offset + 20 <= headerBytes) {
          byteRate = v.getUint32(offset + 16, true)
        }
      } else if (id === 0x64617461 /* "data" */) {
        if (byteRate > 0) {
          const dataSize = size > 0 && size < 0xFFFFFFFF
            ? size
            : Math.max(0, file.size - (offset + 8))
          if (dataSize > 0) return dataSize / byteRate
        }
        break
      }

      // Guard against corrupt/zero chunk sizes to avoid infinite loop
      if (size === 0) break
      offset += 8 + size + (size & 1)
    }
  } catch {
    // fall through to browser element
  }

  // Fallback: try browser audio element (works for small WAV files)
  return new Promise<number>((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const el = document.createElement("audio")
    el.preload = "metadata"
    const cleanup = () => { el.removeAttribute("src"); el.load(); URL.revokeObjectURL(objectUrl) }
    const done = (d: number) => { cleanup(); resolve(d) }
    el.onloadedmetadata = () => {
      const d = Number(el.duration)
      done(Number.isFinite(d) && d > 0 ? d : 0)
    }
    el.onerror = () => done(0)
    // Timeout: if browser hangs on large WAV, resolve with 0 after 5s
    setTimeout(() => { cleanup(); resolve(0) }, 5000)
    el.src = objectUrl
  })
}

function readMediaDurationSeconds(file: File, mediaType: MediaType, extension: string): Promise<number> {
  if (extension === "wav") return readWavDurationSeconds(file)

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const el = mediaType === "video"
      ? document.createElement("video")
      : document.createElement("audio")
    el.preload = "metadata"

    const cleanup = () => { el.removeAttribute("src"); el.load(); URL.revokeObjectURL(objectUrl) }
    const done = (d: number) => { cleanup(); resolve(d) }

    el.onloadedmetadata = () => {
      const d = Number(el.duration)
      done(Number.isFinite(d) && d > 0 ? d : 0)
    }
    el.onerror = () => done(0)
    // Timeout for large MP4 where moov atom is at end (browser may stall)
    setTimeout(() => { cleanup(); resolve(0) }, 10000)

    el.src = objectUrl
  })
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours   = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
