import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { isBanglaText, normaliseBanglaForTTS } from "@/lib/narrationPreprocessor";

export type PremiumTTSSpeed = 0.75 | 1 | 1.25 | 1.5;

interface PremiumTTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentParagraphIndex: number;
  totalParagraphs: number;
  playbackRate: PremiumTTSSpeed;
  elapsedSeconds: number;
  totalDurationSeconds: number;
  currentSegmentText: string;
  /** True when the next paragraph audio isn't ready yet */
  isBuffering: boolean;
}

const log = (...args: unknown[]) => console.log("[PremiumTTS]", ...args);

/* ── Bangla-aware paragraph splitting ──────────────────────────── */

function splitParagraphs(text: string): string[] {
  const normalised = normaliseBanglaForTTS(text);
  const bangla = isBanglaText(normalised);

  let parts = normalised.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 5);
  if (parts.length > 1) return parts;

  parts = normalised.split(/\n/).map((p) => p.trim()).filter((p) => p.length > 5);
  if (parts.length > 1) return parts;

  if (normalised.trim().length > 200) {
    if (bangla) {
      const sentences = normalised.split(/(?<=[।!?])\s+/).filter((s) => s.trim().length > 3);
      if (sentences.length > 1) {
        const grouped: string[] = [];
        let buf: string[] = [];
        for (const s of sentences) {
          buf.push(s);
          if (buf.length >= 3 || buf.join(" ").length > 300) {
            grouped.push(buf.join(" "));
            buf = [];
          }
        }
        if (buf.length) grouped.push(buf.join(" "));
        return grouped;
      }
    } else {
      parts = normalised.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 5);
      if (parts.length > 1) return parts;
    }
  }

  const trimmed = normalised.trim();
  return trimmed.length > 5 ? [trimmed] : [];
}

/* ── Hashing ───────────────────────────────────────────────────── */

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface CachedUrl {
  url: string;
  fetchedAt: number;
}

const SIGNED_URL_TTL_MS = 4 * 60 * 1000;

/** How many paragraphs to keep ahead in the buffer */
const PREFETCH_AHEAD = 3;

export function usePremiumTTS(bookId: string | null, onComplete?: () => void) {
  const [state, setState] = useState<PremiumTTSState>({
    isPlaying: false,
    isPaused: false,
    currentParagraphIndex: -1,
    totalParagraphs: 0,
    playbackRate: 1,
    elapsedSeconds: 0,
    totalDurationSeconds: 0,
    currentSegmentText: "",
    isBuffering: false,
  });

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const paragraphsRef = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isActiveRef = useRef(false);
  const currentIndexRef = useRef(-1);
  const rateRef = useRef<PremiumTTSSpeed>(1);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  // ── Prefetch buffer ────────────────────────────────────────────
  // Maps paragraph index → audio URL (or null if fetch failed)
  const bufferRef = useRef<Map<number, string | null>>(new Map());
  // Track in-flight fetches so we don't double-fetch
  const inflightRef = useRef<Set<number>>(new Set());
  // URL-level cache (text hash → signed URL)
  const urlCacheRef = useRef<Map<string, CachedUrl>>(new Map());

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
  }, []);

  // Tick timer
  useEffect(() => {
    if (state.isPlaying && !state.isPaused) {
      tickRef.current = setInterval(() => {
        elapsedRef.current += 0.5;
        setState((s) => ({ ...s, elapsedSeconds: elapsedRef.current }));
      }, 500);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state.isPlaying, state.isPaused]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  /* ── Fetch from free-tts fallback — Phase 5 (TTS provider pending) ── */
  const fetchFreeTtsUrl = useCallback(async (_text: string): Promise<string | null> => {
    return null;
  }, []);

  /* ── Fetch a single paragraph's audio URL — Phase 5 (TTS provider pending) ── */
  const fetchAudioUrl = useCallback(async (_text: string): Promise<string | null> => {
    return null;
  }, [fetchFreeTtsUrl]);

  /* ── Prefetch upcoming paragraphs into the buffer ─────────────── */
  const prefetchAhead = useCallback((fromIndex: number) => {
    const paragraphs = paragraphsRef.current;
    for (let i = fromIndex; i < Math.min(fromIndex + PREFETCH_AHEAD, paragraphs.length); i++) {
      // Skip if already buffered or in-flight
      if (bufferRef.current.has(i) || inflightRef.current.has(i)) continue;

      inflightRef.current.add(i);
      const text = paragraphs[i];
      log("Prefetching paragraph", i);

      fetchAudioUrl(text)
        .then((url) => {
          bufferRef.current.set(i, url);
          log("Prefetch ready:", i, url ? "✓" : "✗");
        })
        .catch(() => {
          bufferRef.current.set(i, null);
        })
        .finally(() => {
          inflightRef.current.delete(i);
        });
    }
  }, [fetchAudioUrl]);

  /* ── Play a paragraph (uses buffer or waits) ──────────────────── */
  const playParagraph = useCallback(async (index: number) => {
    if (index >= paragraphsRef.current.length || !isActiveRef.current) {
      isActiveRef.current = false;
      cleanupAudio();
      currentIndexRef.current = -1;
      setState((s) => ({
        ...s,
        isPlaying: false,
        isPaused: false,
        currentParagraphIndex: -1,
        currentSegmentText: "",
        isBuffering: false,
      }));
      onCompleteRef.current?.();
      return;
    }

    const text = paragraphsRef.current[index];
    currentIndexRef.current = index;
    setState((s) => ({
      ...s,
      currentParagraphIndex: index,
      currentSegmentText: text,
    }));

    // Kick off prefetch for upcoming paragraphs
    prefetchAhead(index + 1);

    log("Playing paragraph", index + 1, "/", paragraphsRef.current.length);

    // Try to get from buffer first
    let audioUrl = bufferRef.current.get(index) ?? undefined;

    if (audioUrl === undefined) {
      // Not in buffer — show buffering state and fetch now
      setState((s) => ({ ...s, isBuffering: true }));
      log("Buffer miss at", index, "— fetching now");
      audioUrl = (await fetchAudioUrl(text)) ?? undefined;
      if (isActiveRef.current) {
        setState((s) => ({ ...s, isBuffering: false }));
      }
    }

    if (!audioUrl || !isActiveRef.current) {
      if (isActiveRef.current) {
        log("Skipping paragraph", index, "— no audio");
        setTimeout(() => playParagraph(index + 1), 200);
      }
      return;
    }

    cleanupAudio();
    const audio = new Audio(audioUrl);
    audio.playbackRate = rateRef.current;
    audioRef.current = audio;

    audio.onended = () => {
      if (!isActiveRef.current) return;
      // Remove consumed buffer entry
      bufferRef.current.delete(index);
      playParagraph(index + 1);
    };

    audio.onerror = () => {
      log("Audio playback error at paragraph", index);
      bufferRef.current.delete(index);
      if (isActiveRef.current) {
        hashText(text).then((hash) => urlCacheRef.current.delete(hash));
        setTimeout(() => playParagraph(index + 1), 500);
      }
    };

    try {
      await audio.play();
    } catch (err) {
      log("play() rejected:", err);
      if (isActiveRef.current) {
        setTimeout(() => playParagraph(index + 1), 500);
      }
    }
  }, [fetchAudioUrl, cleanupAudio, prefetchAhead]);

  /* ── Public API ──────────────────────────────────────────────── */

  const play = useCallback((text: string) => {
    const paragraphs = splitParagraphs(text);
    if (paragraphs.length === 0) {
      toast.error("No text to read aloud");
      return;
    }

    // Reset buffer
    bufferRef.current.clear();
    inflightRef.current.clear();

    paragraphsRef.current = [...paragraphs];
    isActiveRef.current = true;
    elapsedRef.current = 0;
    currentIndexRef.current = 0;

    const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
    const estDuration = (totalChars * 0.06) / rateRef.current;

    setState({
      isPlaying: true,
      isPaused: false,
      currentParagraphIndex: 0,
      totalParagraphs: paragraphs.length,
      playbackRate: rateRef.current,
      elapsedSeconds: 0,
      totalDurationSeconds: estDuration,
      currentSegmentText: paragraphs[0],
      isBuffering: false,
    });

    // Start prefetching paragraphs 0..PREFETCH_AHEAD-1 immediately
    prefetchAhead(0);
    // Play paragraph 0 (will use buffer if ready, otherwise fetch inline)
    playParagraph(0);
  }, [playParagraph, prefetchAhead]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState((s) => ({ ...s, isPaused: true }));
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
    setState((s) => ({ ...s, isPaused: false }));
  }, []);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    cleanupAudio();
    elapsedRef.current = 0;
    currentIndexRef.current = -1;
    bufferRef.current.clear();
    inflightRef.current.clear();
    setState({
      isPlaying: false,
      isPaused: false,
      currentParagraphIndex: -1,
      totalParagraphs: 0,
      playbackRate: rateRef.current,
      elapsedSeconds: 0,
      totalDurationSeconds: 0,
      currentSegmentText: "",
      isBuffering: false,
    });
  }, [cleanupAudio]);

  const skipForward = useCallback((n = 1) => {
    if (!isActiveRef.current) return;
    cleanupAudio();
    const next = Math.min(paragraphsRef.current.length - 1, currentIndexRef.current + n);
    playParagraph(next);
  }, [playParagraph, cleanupAudio]);

  const skipBackward = useCallback((n = 1) => {
    if (!isActiveRef.current) return;
    cleanupAudio();
    const prev = Math.max(0, currentIndexRef.current - n);
    playParagraph(prev);
  }, [playParagraph, cleanupAudio]);

  const seekToIndex = useCallback((index: number) => {
    if (!isActiveRef.current || paragraphsRef.current.length === 0) return;
    cleanupAudio();
    const clamped = Math.max(0, Math.min(index, paragraphsRef.current.length - 1));
    playParagraph(clamped);
  }, [playParagraph, cleanupAudio]);

  const setSpeed = useCallback((speed: PremiumTTSSpeed) => {
    rateRef.current = speed;
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setState((s) => ({ ...s, playbackRate: speed }));
  }, []);

  return {
    ...state,
    currentSentenceIndex: state.currentParagraphIndex,
    totalSentences: state.totalParagraphs,
    currentEmotion: "neutral" as const,
    play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    seekToIndex,
    setSpeed,
    rawText: "",
  };
}
