import { useState, useCallback, useRef } from "react";
import { useBanglaTTS, type TTSSpeed } from "@/hooks/useBanglaTTS";
import { usePremiumTTS, type PremiumTTSSpeed } from "@/hooks/usePremiumTTS";

export type TtsMode = "browser" | "premium";

/**
 * Unified TTS engine that wraps browser (free) and premium (server-side) TTS.
 * Only one engine is active at a time. Switching modes stops the current engine.
 */
export function useTtsEngine(bookId: string | null, onComplete?: () => void) {
  const [mode, setModeState] = useState<TtsMode>(() => {
    try {
      const saved = localStorage.getItem("tts_mode");
      return saved === "premium" ? "premium" : "browser";
    } catch {
      return "browser";
    }
  });

  const browserTts = useBanglaTTS(mode === "browser" ? onComplete : undefined);
  const premiumTts = usePremiumTTS(bookId, mode === "premium" ? onComplete : undefined);

  // Use refs to avoid stale closures in setMode callback
  const browserTtsRef = useRef(browserTts);
  browserTtsRef.current = browserTts;
  const premiumTtsRef = useRef(premiumTts);
  premiumTtsRef.current = premiumTts;

  const activeEngine = mode === "premium" ? premiumTts : browserTts;

  const setMode = useCallback((newMode: TtsMode) => {
    // Stop BOTH engines to ensure clean state
    try { window.speechSynthesis.cancel(); } catch {}
    browserTtsRef.current.stop();
    premiumTtsRef.current.stop();

    setModeState(newMode);
    try {
      localStorage.setItem("tts_mode", newMode);
    } catch {}
  }, []);

  return {
    mode,
    setMode,
    isPremium: mode === "premium",
    // Forward all state from active engine
    isPlaying: activeEngine.isPlaying,
    isPaused: activeEngine.isPaused,
    currentSentenceIndex: activeEngine.currentSentenceIndex,
    totalSentences: activeEngine.totalSentences,
    currentEmotion: activeEngine.currentEmotion,
    playbackRate: activeEngine.playbackRate,
    elapsedSeconds: activeEngine.elapsedSeconds,
    totalDurationSeconds: activeEngine.totalDurationSeconds,
    currentSegmentText: activeEngine.currentSegmentText,
    // Forward all actions
    play: activeEngine.play,
    pause: activeEngine.pause,
    resume: activeEngine.resume,
    stop: activeEngine.stop,
    skipForward: activeEngine.skipForward,
    skipBackward: activeEngine.skipBackward,
    seekToIndex: activeEngine.seekToIndex,
    setSpeed: activeEngine.setSpeed,
    rawText: activeEngine.rawText,
    // Browser TTS specific (playFromIndex)
    playFromIndex: mode === "browser" ? browserTts.playFromIndex : undefined,
  };
}
