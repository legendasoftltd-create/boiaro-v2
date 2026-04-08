export const DEFAULT_MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024
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
  mp3: { mimeType: "audio/mpeg", mediaType: "audio" },
  m4a: { mimeType: "audio/mp4", mediaType: "audio" },
  mp4: { mimeType: "video/mp4", mediaType: "video" },
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

  const defaultMax = formatInfo.mediaType === "video" ? DEFAULT_MAX_VIDEO_FILE_SIZE : DEFAULT_MAX_AUDIO_FILE_SIZE
  const maxSizeBytes = options.maxSizeBytes ?? defaultMax

  if (originalFile.size > maxSizeBytes) {
    const maxMB = Math.round(maxSizeBytes / (1024 * 1024))
    return { valid: false, error: `${originalFile.name}: File too large (max ${maxMB}MB).` }
  }

  const headerValid = await validateFileHeader(originalFile, extension)
  if (!headerValid) {
    return { valid: false, error: `${originalFile.name}: Invalid file signature for .${extension}` }
  }

  const durationSeconds = await readMediaDurationSeconds(originalFile, formatInfo.mediaType)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { valid: false, error: `${originalFile.name}: Media metadata is invalid (duration must be > 0).` }
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
      durationLabel: formatDuration(durationSeconds),
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
    const buffer = await file.slice(0, 12).arrayBuffer()
    const bytes = new Uint8Array(buffer)

    switch (extension) {
      case "mp3": {
        const hasId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
        const hasSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
        return hasId3 || hasSync
      }
      case "m4a":
      case "mp4": {
        // ftyp box signature at offset 4
        return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
      }
      default:
        return false
    }
  } catch {
    return false
  }
}

function readMediaDurationSeconds(file: File, mediaType: MediaType): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const el = mediaType === "video"
      ? document.createElement("video")
      : document.createElement("audio")
    el.preload = "metadata"

    const cleanup = () => {
      el.removeAttribute("src")
      el.load()
      URL.revokeObjectURL(objectUrl)
    }

    el.onloadedmetadata = () => {
      const duration = Number(el.duration)
      cleanup()
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Invalid duration"))
        return
      }
      resolve(duration)
    }

    el.onerror = () => {
      cleanup()
      reject(new Error("Media metadata read failed"))
    }

    el.src = objectUrl
  })
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
