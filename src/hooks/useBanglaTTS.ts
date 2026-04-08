import { useState, useRef, useCallback, useEffect } from "react";
import {
  preprocessForNarration,
  getVoiceParamsForEmotion,
  getAdaptiveRateMultiplier,
  isBanglaText,
  type NarrationSegment,
  type EmotionTag,
} from "@/lib/narrationPreprocessor";

interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  totalSentences: number;
  currentEmotion: EmotionTag;
  playbackRate: number;
  /** Estimated elapsed seconds based on segment pacing */
  elapsedSeconds: number;
  /** Estimated total duration in seconds */
  totalDurationSeconds: number;
}

const TTS_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export type TTSSpeed = (typeof TTS_SPEEDS)[number];
export { TTS_SPEEDS };

/** Average reading time per Bangla character at rate 1.0 */
const CHAR_DURATION_SEC = 0.08;

function estimateDuration(segments: NarrationSegment[], rate: number): number {
  return segments.reduce(
    (sum, s) => sum + (s.text.length * CHAR_DURATION_SEC) / rate + s.postPauseMs / 1000,
    0,
  );
}

/* ── Bangla-first voice selection ──────────────────────────────── */

/**
 * Returns the best available voice for the given text.
 * Priority: bn-BD → bn-* → hi-* (phonetically close) → default.
 * Caches voice list to avoid repeated getVoices() calls.
 */
let _voiceCache: SpeechSynthesisVoice[] | null = null;

function refreshVoiceCache(): SpeechSynthesisVoice[] {
  _voiceCache = window.speechSynthesis.getVoices();
  return _voiceCache;
}

function getBestVoice(text: string): { voice: SpeechSynthesisVoice | null; lang: string } {
  const voices = _voiceCache?.length ? _voiceCache : refreshVoiceCache();
  const bangla = isBanglaText(text);

  if (bangla) {
    // Prefer bn-BD, then any bn-*, then hi-* as phonetic cousin
    const bnBD = voices.find((v) => v.lang === "bn-BD");
    if (bnBD) return { voice: bnBD, lang: "bn-BD" };

    const bnAny = voices.find((v) => v.lang.startsWith("bn"));
    if (bnAny) return { voice: bnAny, lang: bnAny.lang };

    const hiAny = voices.find((v) => v.lang.startsWith("hi"));
    if (hiAny) return { voice: hiAny, lang: hiAny.lang };

    // No Bangla voice found — fall through to null but still set lang hint
    return { voice: null, lang: "bn-BD" };
  }

  // English / other text
  const enVoice = voices.find((v) => v.lang.startsWith("en"));
  return { voice: enVoice || null, lang: enVoice?.lang || "en-US" };
}

export function useBanglaTTS(onComplete?: () => void) {
  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    currentSentenceIndex: -1,
    totalSentences: 0,
    currentEmotion: "neutral",
    playbackRate: 1,
    elapsedSeconds: 0,
    totalDurationSeconds: 0,
  });
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const segmentsRef = useRef<NarrationSegment[]>([]);
  const currentIndexRef = useRef(-1);
  const isActiveRef = useRef(false);
  const rateRef = useRef(1);
  const elapsedRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rawTextRef = useRef("");

  // Tick timer for elapsed seconds while playing
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
    const loadVoices = () => refreshVoiceCache();
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const speakSegment = useCallback((index: number) => {
    if (index >= segmentsRef.current.length || !isActiveRef.current) {
      isActiveRef.current = false;
      setState((s) => ({
        ...s,
        isPlaying: false,
        isPaused: false,
        currentSentenceIndex: -1,
        currentEmotion: "neutral",
      }));
      onCompleteRef.current?.();
      return;
    }

    const segment = segmentsRef.current[index];
    currentIndexRef.current = index;

    // Estimate elapsed time up to current segment
    const elapsed = segmentsRef.current
      .slice(0, index)
      .reduce(
        (sum, s) =>
          sum + (s.text.length * CHAR_DURATION_SEC) / rateRef.current + s.postPauseMs / 1000,
        0,
      );
    elapsedRef.current = elapsed;

    setState((s) => ({
      ...s,
      currentSentenceIndex: index,
      currentEmotion: segment.emotion,
      elapsedSeconds: elapsed,
    }));

    const utterance = new SpeechSynthesisUtterance(segment.text);

    // Bangla-first voice selection per segment
    const { voice, lang } = getBestVoice(segment.text);
    if (voice) utterance.voice = voice;
    utterance.lang = lang;

    const params = getVoiceParamsForEmotion(segment.emotion);
    const adaptiveRate = getAdaptiveRateMultiplier(segment.text);
    utterance.rate = params.rate * rateRef.current * adaptiveRate;
    utterance.pitch = params.pitch;
    utterance.volume = params.volume;

    utterance.onend = () => {
      if (!isActiveRef.current) return;
      setTimeout(() => {
        if (isActiveRef.current) speakSegment(index + 1);
      }, segment.postPauseMs);
    };

    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") return;
      console.warn("[TTS] Error:", e.error);
      if (isActiveRef.current) setTimeout(() => speakSegment(index + 1), 200);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const playFromIndex = useCallback(
    (text: string, startIndex: number) => {
      window.speechSynthesis.cancel();
      const segments = preprocessForNarration(text);
      if (segments.length === 0) return;

      segmentsRef.current = segments;
      rawTextRef.current = text;
      isActiveRef.current = true;
      const idx = Math.max(0, Math.min(startIndex, segments.length - 1));
      const totalDur = estimateDuration(segments, rateRef.current);

      setState({
        isPlaying: true,
        isPaused: false,
        currentSentenceIndex: idx,
        totalSentences: segments.length,
        currentEmotion: segments[idx].emotion,
        playbackRate: rateRef.current,
        elapsedSeconds: 0,
        totalDurationSeconds: totalDur,
      });

      speakSegment(idx);
    },
    [speakSegment],
  );

  const play = useCallback(
    (text: string) => playFromIndex(text, 0),
    [playFromIndex],
  );

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState((s) => ({ ...s, isPaused: true }));
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState((s) => ({ ...s, isPaused: false }));
  }, []);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    window.speechSynthesis.cancel();
    elapsedRef.current = 0;
    setState({
      isPlaying: false,
      isPaused: false,
      currentSentenceIndex: -1,
      totalSentences: 0,
      currentEmotion: "neutral",
      playbackRate: rateRef.current,
      elapsedSeconds: 0,
      totalDurationSeconds: 0,
    });
  }, []);

  const skipForward = useCallback(
    (n = 3) => {
      if (!isActiveRef.current) return;
      window.speechSynthesis.cancel();
      const next = Math.min(currentIndexRef.current + n, segmentsRef.current.length - 1);
      speakSegment(next);
    },
    [speakSegment],
  );

  const skipBackward = useCallback(
    (n = 3) => {
      if (!isActiveRef.current) return;
      window.speechSynthesis.cancel();
      const prev = Math.max(currentIndexRef.current - n, 0);
      speakSegment(prev);
    },
    [speakSegment],
  );

  const seekToIndex = useCallback(
    (index: number) => {
      if (!isActiveRef.current || segmentsRef.current.length === 0) return;
      window.speechSynthesis.cancel();
      const clamped = Math.max(0, Math.min(index, segmentsRef.current.length - 1));
      speakSegment(clamped);
    },
    [speakSegment],
  );

  const setSpeed = useCallback(
    (speed: TTSSpeed) => {
      rateRef.current = speed;
      const totalDur = estimateDuration(segmentsRef.current, speed);
      setState((s) => ({
        ...s,
        playbackRate: speed,
        totalDurationSeconds: totalDur,
      }));
      if (isActiveRef.current) {
        window.speechSynthesis.cancel();
        speakSegment(currentIndexRef.current);
      }
    },
    [speakSegment],
  );

  const currentSegmentText =
    state.currentSentenceIndex >= 0 && state.currentSentenceIndex < segmentsRef.current.length
      ? segmentsRef.current[state.currentSentenceIndex].text
      : "";

  return {
    ...state,
    play,
    playFromIndex,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    seekToIndex,
    setSpeed,
    currentSegmentText,
    rawText: rawTextRef.current,
  };
}
