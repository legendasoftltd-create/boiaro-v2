/**
 * Persistent TTS audio URL cache backed by localStorage.
 *
 * Cache key format: tts_v1:{bookId}:{voiceId}:{textHash}
 * Value: S3 audio URL (string)
 *
 * URLs are only written after a paragraph plays to completion so we never
 * cache a URL that was never confirmed working.
 */

const CACHE_PREFIX = "tts_v1";

/** Lightweight djb2 hash — fast, synchronous, good enough for cache keys */
function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(33, h) ^ s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function makeKey(bookId: string, voiceId: string, text: string): string {
  return `${CACHE_PREFIX}:${bookId}:${voiceId}:${hashText(text)}`;
}

export function getTtsCachedUrl(bookId: string, voiceId: string, text: string): string | null {
  try {
    return localStorage.getItem(makeKey(bookId, voiceId, text));
  } catch {
    return null;
  }
}

export function saveTtsCachedUrl(bookId: string, voiceId: string, text: string, url: string): void {
  try {
    localStorage.setItem(makeKey(bookId, voiceId, text), url);
  } catch {
    // localStorage full — evict oldest TTS entries and retry once
    evictOldest();
    try { localStorage.setItem(makeKey(bookId, voiceId, text), url); } catch { /* ignore */ }
  }
}

/** Remove all cached entries for a specific book+voice combination */
export function clearTtsBookCache(bookId: string, voiceId: string): void {
  try {
    const prefix = `${CACHE_PREFIX}:${bookId}:${voiceId}:`;
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) toDelete.push(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/** Evict up to 50 oldest TTS entries to make room */
function evictOldest(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.slice(0, 50).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
