import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { getTtsCachedUrl, saveTtsCachedUrl, clearTtsBookCache } from "@/lib/ttsCache";

export type PremiumTTSSpeed = 0.7 | 0.85 | 1 | 1.1 | 1.2;

// Bengali voice IDs — must match server/src/routers/tts.ts BENGALI_VOICES
export const BENGALI_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah",  label: "সারা (মহিলা)" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   label: "লিলি (মহিলা)" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", label: "জর্জ (পুরুষ)" },
] as const;

export type BengaliVoiceId = typeof BENGALI_VOICES[number]["id"];
const DEFAULT_VOICE_ID: BengaliVoiceId = "EXAVITQu4vr4xnSDxMaL"; // Sarah

/**
 * How many paragraphs ahead to generate and cache in urlCacheRef.
 * These are real generate calls whose URLs land in memory so the next
 * paragraph plays with zero network wait.
 */
const LOOKAHEAD = 3;

/**
 * How many paragraphs to pre-warm silently before the user presses play.
 * Pre-warm generates the first N paragraphs so pressing play is instant.
 */
const PREWARM_COUNT = 2;

const MAX_PARA_CHARS = 2500;

interface PremiumTTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  isGenerating: boolean;
  isPreWarming: boolean;   // silently generating before user presses play
  isPreWarmed: boolean;    // first paragraphs are ready in cache
  currentTime: number;
  duration: number;
  playbackRate: PremiumTTSSpeed;
  paragraphIndex: number;
  totalParagraphs: number;
  error: string | null;
}

const log = (...a: unknown[]) => console.log("[PremiumTTS]", ...a);

function splitParagraphs(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, "")
    .replace(/\n/g, " ")
    .replace(//g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();

  const raw = normalized.split(/\n{2,}|।\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const para of raw) {
    if (para.length <= MAX_PARA_CHARS) {
      chunks.push(para);
    } else {
      const sentences = para.split(/(?<=[।.!?])\s+/);
      let cur = "";
      for (const s of sentences) {
        if ((cur + s).length > MAX_PARA_CHARS && cur) { chunks.push(cur.trim()); cur = s; }
        else cur += (cur ? " " : "") + s;
      }
      if (cur.trim()) chunks.push(cur.trim());
    }
  }
  return chunks.length ? chunks : [normalized.substring(0, MAX_PARA_CHARS)];
}

export function usePremiumTTS(
  bookId: string | null,
  onComplete?: () => void,
  onQuotaExceeded?: () => void,
  onAccessDenied?: () => void,
) {
  const generateMutation = trpc.tts.generateParagraph.useMutation();

  const [state, setState] = useState<PremiumTTSState>({
    isPlaying: false, isPaused: false, isLoading: false, isGenerating: false,
    isPreWarming: false, isPreWarmed: false,
    currentTime: 0, duration: 0, playbackRate: 1, paragraphIndex: 0,
    totalParagraphs: 0, error: null,
  });

  const audioRef            = useRef<HTMLAudioElement | null>(null);
  const onCompleteRef       = useRef(onComplete);
  onCompleteRef.current     = onComplete;
  const onQuotaExceededRef  = useRef(onQuotaExceeded);
  onQuotaExceededRef.current = onQuotaExceeded;
  const onAccessDeniedRef   = useRef(onAccessDenied);
  onAccessDeniedRef.current = onAccessDenied;

  const paragraphsRef       = useRef<string[]>([]);
  const urlCacheRef         = useRef<Map<number, string>>(new Map()); // idx → audio URL
  const pendingPersistRef   = useRef<Map<number, string>>(new Map());
  const currentIdxRef       = useRef(0);
  const voiceIdRef          = useRef<BengaliVoiceId>(DEFAULT_VOICE_ID);
  const bookIdRef           = useRef<string | null>(bookId);
  bookIdRef.current         = bookId;
  const rateRef             = useRef<PremiumTTSSpeed>(1);
  const activeRef           = useRef(false);
  const preWarmTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preWarmTextRef      = useRef<string>(""); // text that was pre-warmed
  const playParagraphRef    = useRef<(idx: number) => void>(() => {});

  // ── Audio element ──────────────────────────────────────────────────────────
  const cleanupAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.removeAttribute("src");
    audioRef.current.load();
    audioRef.current = null;
  }, []);

  const playAudioUrl = useCallback((url: string, idx: number, total: number) => {
    cleanupAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.playbackRate = rateRef.current;

    audio.onloadedmetadata = () =>
      setState(s => ({ ...s, duration: audio.duration, isLoading: false }));

    audio.ontimeupdate = () =>
      setState(s => ({ ...s, currentTime: audio.currentTime }));

    audio.onended = () => {
      // Persist URL to localStorage after confirmed playback
      const bid = bookIdRef.current;
      const text = paragraphsRef.current[idx];
      const pendingUrl = pendingPersistRef.current.get(idx);
      if (bid && text && pendingUrl) {
        saveTtsCachedUrl(bid, voiceIdRef.current, text, pendingUrl);
        pendingPersistRef.current.delete(idx);
        log(`Cached paragraph ${idx} to localStorage`);
      }

      const next = idx + 1;
      if (!activeRef.current) return;
      if (next < total) {
        playParagraphRef.current(next);
      } else {
        activeRef.current = false;
        setState(s => ({ ...s, isPlaying: false, isPaused: false, currentTime: 0 }));
        onCompleteRef.current?.();
      }
    };

    audio.onerror = () => {
      log(`Audio error on paragraph ${idx} — skipping`);
      const next = idx + 1;
      if (!activeRef.current) return;
      if (next < total) {
        playParagraphRef.current(next);
      } else {
        activeRef.current = false;
        setState(s => ({ ...s, isPlaying: false, isPaused: false, currentTime: 0 }));
        onCompleteRef.current?.();
      }
    };

    setState(s => ({
      ...s, isLoading: true, isPlaying: true, isPaused: false,
      paragraphIndex: idx, totalParagraphs: total, currentTime: 0,
    }));

    audio.play().catch(err => {
      log("Play error:", err);
      toast.error("অডিও প্লে করতে সমস্যা হয়েছে");
    });
  }, [cleanupAudio]);

  // ── Fetch URL for one paragraph (memory → localStorage → server) ──────────
  const ensureParagraph = useCallback(async (idx: number): Promise<string | null> => {
    const bid = bookIdRef.current;
    if (!bid) return null;

    // 1. Memory cache (fastest — already generated this session)
    if (urlCacheRef.current.has(idx)) return urlCacheRef.current.get(idx)!;

    const text = paragraphsRef.current[idx];
    if (!text) return null;

    // 2. localStorage cache (no network call)
    const persisted = getTtsCachedUrl(bid, voiceIdRef.current, text);
    if (persisted) {
      urlCacheRef.current.set(idx, persisted);
      log(`localStorage hit paragraph ${idx}`);
      return persisted;
    }

    // 3. Generate via server (ElevenLabs → S3 → DB)
    const result = await generateMutation.mutateAsync({
      bookId: bid,
      text,
      voiceId: voiceIdRef.current,
      paragraphIndex: idx,
    });

    if (result.success && result.audioUrl) {
      urlCacheRef.current.set(idx, result.audioUrl);
      pendingPersistRef.current.set(idx, result.audioUrl);
      return result.audioUrl;
    }
    if ((result as any).quotaExceeded) {
      activeRef.current = false;
      onQuotaExceededRef.current?.();
      throw new Error("QUOTA_EXCEEDED");
    }
    throw new Error((result as any).error ?? "Generation failed");
  }, [generateMutation]);

  // ── Pre-fetch next LOOKAHEAD paragraphs in parallel into urlCacheRef ──────
  // Uses generateMutation (returns URLs to client) so the next paragraph
  // is already in urlCacheRef when needed — zero network wait between paragraphs.
  const prefetchAhead = useCallback((fromIdx: number) => {
    const bid = bookIdRef.current;
    if (!bid) return;
    const total = paragraphsRef.current.length;

    for (let i = fromIdx + 1; i < Math.min(fromIdx + 1 + LOOKAHEAD, total); i++) {
      if (urlCacheRef.current.has(i)) continue;
      const text = paragraphsRef.current[i];
      if (!text) continue;

      // Check localStorage first (no network needed)
      const local = getTtsCachedUrl(bid, voiceIdRef.current, text);
      if (local) {
        urlCacheRef.current.set(i, local);
        log(`prefetch: localStorage hit paragraph ${i}`);
        continue;
      }

      // Generate and store in memory cache (fire-and-forget, non-blocking)
      const idx = i;
      generateMutation.mutateAsync({
        bookId: bid,
        text,
        voiceId: voiceIdRef.current,
        paragraphIndex: idx,
      }).then(result => {
        if (result.success && result.audioUrl) {
          urlCacheRef.current.set(idx, result.audioUrl);
          pendingPersistRef.current.set(idx, result.audioUrl);
          log(`prefetch: stored paragraph ${idx} in urlCache`);
        }
      }).catch(() => {}); // non-fatal background operation
    }
  }, [generateMutation]);

  // ── Play a specific paragraph ──────────────────────────────────────────────
  const playParagraph = useCallback(async (idx: number) => {
    if (!activeRef.current) return;
    const total = paragraphsRef.current.length;
    if (idx >= total) return;

    currentIdxRef.current = idx;
    setState(s => ({ ...s, isGenerating: true, error: null }));

    // Kick off prefetch for next paragraphs IN PARALLEL with this one generating.
    // If the paragraph is already cached, prefetchAhead is a pure localStorage lookup.
    prefetchAhead(idx);

    try {
      const url = await ensureParagraph(idx);
      if (!url || !activeRef.current) return;
      setState(s => ({ ...s, isGenerating: false }));
      playAudioUrl(url, idx, total);
    } catch (err) {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        activeRef.current = false;
        onAccessDeniedRef.current?.();
        setState(s => ({ ...s, isGenerating: false, isPlaying: false, error: null }));
        return;
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      log("Error paragraph", idx, msg);
      if (msg !== "QUOTA_EXCEEDED" && msg !== "ACCESS_DENIED") {
        toast.error(`AI ভয়েস তৈরিতে সমস্যা: ${msg}`);
      }
      setState(s => ({ ...s, isGenerating: false, isPlaying: false, error: msg }));
    }
  }, [ensureParagraph, playAudioUrl, prefetchAhead]);

  playParagraphRef.current = playParagraph;

  // ── Pre-warm: silently generate first PREWARM_COUNT paragraphs ────────────
  // Call this with the page text before the user presses play so the first
  // paragraph is already in urlCacheRef and playback starts immediately.
  const preWarm = useCallback((fullText: string) => {
    const bid = bookIdRef.current;
    if (!bid || !fullText.trim()) return;

    // Debounce: cancel previous pre-warm when text changes (page turn)
    if (preWarmTimerRef.current) clearTimeout(preWarmTimerRef.current);
    setState(s => ({ ...s, isPreWarmed: false }));

    preWarmTimerRef.current = setTimeout(async () => {
      const paras = splitParagraphs(fullText);
      if (paras.length === 0) return;

      // Only pre-warm if text actually changed (avoid redundant generation)
      const textKey = paras.slice(0, PREWARM_COUNT).join("|");
      if (preWarmTextRef.current === textKey) {
        // Text unchanged — check if paragraphs 0..N-1 are still in cache
        const allCached = Array.from({ length: Math.min(PREWARM_COUNT, paras.length) })
          .every((_, i) => urlCacheRef.current.has(i) || !!getTtsCachedUrl(bid, voiceIdRef.current, paras[i]));
        if (allCached) {
          setState(s => ({ ...s, isPreWarmed: true }));
          return;
        }
      }

      log(`Pre-warming ${Math.min(PREWARM_COUNT, paras.length)} paragraphs…`);
      setState(s => ({ ...s, isPreWarming: true, isPreWarmed: false }));

      // Store paragraphs so ensureParagraph can find them during pre-warm
      paragraphsRef.current = paras;

      await Promise.all(
        Array.from({ length: Math.min(PREWARM_COUNT, paras.length) }, (_, i) => i)
          .map(async (idx) => {
            if (urlCacheRef.current.has(idx)) return;
            const text = paras[idx];
            if (!text) return;

            const local = getTtsCachedUrl(bid, voiceIdRef.current, text);
            if (local) { urlCacheRef.current.set(idx, local); return; }

            try {
              const result = await generateMutation.mutateAsync({
                bookId: bid,
                text,
                voiceId: voiceIdRef.current,
                paragraphIndex: idx,
              });
              if (result.success && result.audioUrl) {
                urlCacheRef.current.set(idx, result.audioUrl);
                pendingPersistRef.current.set(idx, result.audioUrl);
                log(`Pre-warm: paragraph ${idx} ready`);
              }
            } catch {
              // non-fatal — play will generate on-demand if pre-warm fails
            }
          })
      );

      preWarmTextRef.current = textKey;
      setState(s => ({ ...s, isPreWarming: false, isPreWarmed: true }));
      log("Pre-warm complete — ready to play instantly");
    }, 1200); // 1.2s debounce so rapid page turns don't spam the server
  }, [generateMutation]);

  // ── Play ───────────────────────────────────────────────────────────────────
  const play = useCallback(async (fullText: string) => {
    if (!fullText.trim()) { toast.error("পাঠ্য বিষয় নেই"); return; }

    activeRef.current = true;
    pendingPersistRef.current.clear();

    const newParas = splitParagraphs(fullText);

    // Preserve urlCache if same text (user pressed play on same page again)
    const newTextKey = newParas.slice(0, PREWARM_COUNT).join("|");
    if (preWarmTextRef.current !== newTextKey) {
      // Text changed — clear cache for old text
      urlCacheRef.current.clear();
    }

    paragraphsRef.current = newParas;
    currentIdxRef.current = 0;

    // Check if paragraph 0 is already pre-warmed (play will be instant)
    const bid = bookIdRef.current;
    const para0 = newParas[0];
    const isReady = urlCacheRef.current.has(0) ||
      (bid && para0 && !!getTtsCachedUrl(bid, voiceIdRef.current, para0));

    if (!isReady) {
      toast.info("AI ভয়েস প্রস্তুত হচ্ছে…");
    }

    setState(s => ({ ...s, isPreWarmed: isReady }));
    await playParagraph(0);
  }, [playParagraph]);

  // ── Pause / Resume / Stop ─────────────────────────────────────────────────
  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState(s => ({ ...s, isPaused: true, isPlaying: false }));
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
    setState(s => ({ ...s, isPaused: false, isPlaying: true }));
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    cleanupAudio();
    if (preWarmTimerRef.current) clearTimeout(preWarmTimerRef.current);
    urlCacheRef.current.clear();
    pendingPersistRef.current.clear();
    paragraphsRef.current = [];
    preWarmTextRef.current = "";
    setState({
      isPlaying: false, isPaused: false, isLoading: false, isGenerating: false,
      isPreWarming: false, isPreWarmed: false,
      currentTime: 0, duration: 0, playbackRate: rateRef.current,
      paragraphIndex: 0, totalParagraphs: 0, error: null,
    });
  }, [cleanupAudio]);

  const skipForward = useCallback((seconds = 10) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(audioRef.current.currentTime + seconds, audioRef.current.duration);
    }
  }, []);

  const skipBackward = useCallback((seconds = 10) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(audioRef.current.currentTime - seconds, 0);
    }
  }, []);

  const seekToIndex = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration));
    }
  }, []);

  const setSpeed = useCallback((speed: PremiumTTSSpeed) => {
    rateRef.current = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
    setState(s => ({ ...s, playbackRate: speed }));
  }, []);

  const setVoice = useCallback((voiceId: BengaliVoiceId) => {
    urlCacheRef.current.clear();
    pendingPersistRef.current.clear();
    preWarmTextRef.current = "";
    voiceIdRef.current = voiceId;
    setState(s => ({ ...s, isPreWarmed: false }));
  }, []);

  useEffect(() => () => {
    activeRef.current = false;
    if (preWarmTimerRef.current) clearTimeout(preWarmTimerRef.current);
    cleanupAudio();
  }, [cleanupAudio]);

  return {
    ...state,
    currentSentenceIndex: state.paragraphIndex,
    totalSentences: state.totalParagraphs,
    currentEmotion: "neutral" as const,
    elapsedSeconds: state.currentTime,
    totalDurationSeconds: state.duration,
    currentSegmentText: paragraphsRef.current[state.paragraphIndex] ?? "",
    isBuffering: state.isLoading,
    rawText: paragraphsRef.current.join("\n\n"),
    voiceId: voiceIdRef.current,
    play,
    preWarm,             // call with page text to pre-generate before user presses play
    playFromIndex: play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    seekToIndex,
    setSpeed,
    setVoice,
    clearBookCache: useCallback(() => {
      if (bookId) clearTtsBookCache(bookId, voiceIdRef.current);
    }, [bookId]),
  };
}
