import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export type PremiumTTSSpeed = 0.7 | 0.85 | 1 | 1.1 | 1.2;

// Bengali voice IDs — must match server/src/routers/tts.ts BENGALI_VOICES
export const BENGALI_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah",  label: "সারা (মহিলা)" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   label: "লিলি (মহিলা)" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", label: "জর্জ (পুরুষ)" },
] as const;

export type BengaliVoiceId = typeof BENGALI_VOICES[number]["id"];
const DEFAULT_VOICE_ID: BengaliVoiceId = "EXAVITQu4vr4xnSDxMaL"; // Sarah

const LOOKAHEAD = 3; // pre-generate this many paragraphs ahead
const MAX_PARA_CHARS = 2500;

interface PremiumTTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  isGenerating: boolean;
  currentTime: number;
  duration: number;
  playbackRate: PremiumTTSSpeed;
  paragraphIndex: number;
  totalParagraphs: number;
  error: string | null;
}

const log = (...a: unknown[]) => console.log("[PremiumTTS]", ...a);

function splitParagraphs(text: string): string[] {
  const raw = text.split(/\n{2,}|।\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const para of raw) {
    if (para.length <= MAX_PARA_CHARS) {
      chunks.push(para);
    } else {
      const sentences = para.split(/(?<=।)\s+/);
      let cur = "";
      for (const s of sentences) {
        if ((cur + s).length > MAX_PARA_CHARS && cur) { chunks.push(cur.trim()); cur = s; }
        else cur += (cur ? " " : "") + s;
      }
      if (cur.trim()) chunks.push(cur.trim());
    }
  }
  return chunks.length ? chunks : [text.substring(0, MAX_PARA_CHARS)];
}

export function usePremiumTTS(bookId: string | null, onComplete?: () => void, onQuotaExceeded?: () => void) {
  const generateMutation   = trpc.tts.generateParagraph.useMutation();
  const prefetchMutation   = trpc.tts.prefetchParagraphs.useMutation();

  const [state, setState] = useState<PremiumTTSState>({
    isPlaying: false, isPaused: false, isLoading: false, isGenerating: false,
    currentTime: 0, duration: 0, playbackRate: 1, paragraphIndex: 0,
    totalParagraphs: 0, error: null,
  });

  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const onCompleteRef  = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onQuotaExceededRef = useRef(onQuotaExceeded);
  onQuotaExceededRef.current = onQuotaExceeded;

  const paragraphsRef  = useRef<string[]>([]);
  const urlCacheRef    = useRef<Map<number, string>>(new Map()); // index → audio URL
  const currentIdxRef  = useRef(0);
  const voiceIdRef     = useRef<BengaliVoiceId>(DEFAULT_VOICE_ID);
  const rateRef        = useRef<PremiumTTSSpeed>(1);
  const activeRef      = useRef(false);

  // ── Audio element setup ────────────────────────────────────────────────────
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
      const next = idx + 1;
      if (!activeRef.current) return;
      if (next < total) {
        playParagraph(next);
      } else {
        activeRef.current = false;
        setState(s => ({ ...s, isPlaying: false, isPaused: false, currentTime: 0 }));
        onCompleteRef.current?.();
      }
    };

    audio.onerror = () => {
      setState(s => ({ ...s, isPlaying: false, error: "Audio playback failed" }));
    };

    setState(s => ({
      ...s, isLoading: true, isPlaying: true, isPaused: false,
      paragraphIndex: idx, totalParagraphs: total, currentTime: 0,
    }));

    audio.play().catch(err => {
      log("Play error:", err);
      toast.error("অডিও প্লে করতে সমস্যা হয়েছে");
    });
  }, [cleanupAudio]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate a paragraph and cache URL ────────────────────────────────────
  const ensureParagraph = useCallback(async (idx: number): Promise<string | null> => {
    if (!bookId) return null;
    if (urlCacheRef.current.has(idx)) return urlCacheRef.current.get(idx)!;

    const text = paragraphsRef.current[idx];
    if (!text) return null;

    const result = await generateMutation.mutateAsync({
      bookId,
      text,
      voiceId: voiceIdRef.current,
      paragraphIndex: idx,
    });

    if (result.success && result.audioUrl) {
      urlCacheRef.current.set(idx, result.audioUrl);
      return result.audioUrl;
    }
    if ((result as any).quotaExceeded) {
      activeRef.current = false;
      onQuotaExceededRef.current?.();
      throw new Error("QUOTA_EXCEEDED");
    }
    throw new Error((result as any).error ?? "Generation failed");
  }, [bookId, generateMutation]);

  // ── Lookahead prefetch ─────────────────────────────────────────────────────
  const prefetchAhead = useCallback((fromIdx: number) => {
    if (!bookId) return;
    const total = paragraphsRef.current.length;
    const toFetch = [];
    for (let i = fromIdx + 1; i < Math.min(fromIdx + 1 + LOOKAHEAD, total); i++) {
      if (!urlCacheRef.current.has(i)) {
        toFetch.push({ text: paragraphsRef.current[i], index: i });
      }
    }
    if (toFetch.length > 0) {
      prefetchMutation.mutate({ bookId, paragraphs: toFetch, voiceId: voiceIdRef.current });
    }
  }, [bookId, prefetchMutation]);

  // ── Play a specific paragraph ──────────────────────────────────────────────
  const playParagraph = useCallback(async (idx: number) => {
    if (!activeRef.current) return;
    const total = paragraphsRef.current.length;
    if (idx >= total) return;

    currentIdxRef.current = idx;
    setState(s => ({ ...s, isGenerating: true, error: null }));

    try {
      const url = await ensureParagraph(idx);
      if (!url || !activeRef.current) return;
      setState(s => ({ ...s, isGenerating: false }));
      playAudioUrl(url, idx, total);
      prefetchAhead(idx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      log("Error paragraph", idx, msg);
      if (msg !== "QUOTA_EXCEEDED") {
        toast.error(`AI ভয়েস তৈরিতে সমস্যা: ${msg}`);
      }
      setState(s => ({ ...s, isGenerating: false, isPlaying: false, error: msg }));
    }
  }, [ensureParagraph, playAudioUrl, prefetchAhead]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const play = useCallback(async (fullText: string) => {
    if (!fullText.trim()) { toast.error("পাঠ্য বিষয় নেই"); return; }
    activeRef.current = true;
    urlCacheRef.current.clear();

    paragraphsRef.current = splitParagraphs(fullText);
    currentIdxRef.current = 0;

    toast.info("AI ভয়েস তৈরি হচ্ছে…");
    await playParagraph(0);
  }, [playParagraph]);

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
    urlCacheRef.current.clear();
    paragraphsRef.current = [];
    setState({
      isPlaying: false, isPaused: false, isLoading: false, isGenerating: false,
      currentTime: 0, duration: 0, playbackRate: rateRef.current,
      paragraphIndex: 0, totalParagraphs: 0, error: null,
    });
  }, [cleanupAudio]);

  const skipForward = useCallback((seconds = 10) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.currentTime + seconds, audioRef.current.duration
      );
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
    voiceIdRef.current = voiceId;
    urlCacheRef.current.clear(); // invalidate cache for new voice
  }, []);

  useEffect(() => () => { activeRef.current = false; cleanupAudio(); }, [cleanupAudio]);

  // Compat surface for useTtsEngine
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
    playFromIndex: play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    seekToIndex,
    setSpeed,
    setVoice,
  };
}
