import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

export type PremiumTTSSpeed = 0.75 | 1 | 1.25 | 1.5;

interface PremiumTTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  playbackRate: PremiumTTSSpeed;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
}

const log = (...args: unknown[]) => console.log("[PremiumTTS]", ...args);

export function usePremiumTTS(bookId: string | null, onComplete?: () => void) {
  const [state, setState] = useState<PremiumTTSState>({
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    isLoading: false,
    isGenerating: false,
    error: null,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isActiveRef = useRef(false);
  const rateRef = useRef<PremiumTTSSpeed>(1);
  const rawTextRef = useRef("");
  const currentAudioUrlRef = useRef<string | null>(null);

  // Cleanup audio element
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
  }, []);

  // Setup audio element with event listeners
  const setupAudio = useCallback((audioUrl: string) => {
    cleanupAudio();

    const audio = new Audio();
    audioRef.current = audio;
    currentAudioUrlRef.current = audioUrl;

    // Update state when audio metadata loads
    audio.addEventListener("loadedmetadata", () => {
      setState((s) => ({
        ...s,
        duration: audio.duration,
        isLoading: false,
      }));
    });

    // Update current time as audio plays
    audio.addEventListener("timeupdate", () => {
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
    });

    // Handle audio ended
    audio.addEventListener("ended", () => {
      setState((s) => ({
        ...s,
        isPlaying: false,
        isPaused: false,
        currentTime: 0,
      }));
      onCompleteRef.current?.();
    });

    // Handle errors
    audio.addEventListener("error", (e) => {
      log("Audio error:", e);
      setState((s) => ({
        ...s,
        isPlaying: false,
        isPaused: false,
        error: "Failed to play audio",
      }));
    });

    // Set source and attempt to play
    audio.src = audioUrl;
    audio.playbackRate = rateRef.current;
  }, [cleanupAudio]);

  // Generate or get full book audio from backend
  const generateFullBookAudio = useCallback(
    async (fullText: string) => {
      if (!bookId) {
        toast.error("Book ID required for TTS");
        return null;
      }

      try {
        setState((s) => ({
          ...s,
          isGenerating: true,
          error: null,
        }));

        log("Requesting full book audio generation for book:", bookId);

        const API_BASE =
          (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
        const token = localStorage.getItem("access_token");

        // Call backend to generate or get cached full book audio
        const response = await fetch(`${API_BASE}/trpc/tts.getOrGenerateFullBookAudio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({
            bookId,
            fullText: fullText.trim(),
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !result.result?.audioUrl) {
          throw new Error(result.result?.error || "Failed to generate audio");
        }

        log(
          "Audio URL received:",
          result.result.cached ? "(cached)" : "(newly generated)",
          result.result.audioUrl.substring(0, 100) + "..."
        );

        setState((s) => ({
          ...s,
          isGenerating: false,
        }));

        return result.result.audioUrl;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        log("Error generating audio:", errorMsg);
        toast.error(`Failed to generate audio: ${errorMsg}`);
        setState((s) => ({
          ...s,
          isGenerating: false,
          error: errorMsg,
        }));
        return null;
      }
    },
    [bookId]
  );

  // Play full book audio
  const play = useCallback(
    async (fullText: string) => {
      if (!fullText || fullText.trim().length === 0) {
        toast.error("No text to read aloud");
        return;
      }

      rawTextRef.current = fullText;
      isActiveRef.current = true;

      // Check if we already have an audio URL for this book
      if (currentAudioUrlRef.current) {
        log("Resuming existing audio");
        setupAudio(currentAudioUrlRef.current);
        setState((s) => ({ ...s, isLoading: true }));
        audioRef.current?.play().catch((err) => {
          log("Play error:", err);
        });
        setState((s) => ({
          ...s,
          isPlaying: true,
          isPaused: false,
          currentTime: 0,
        }));
        return;
      }

      // Generate or get cached full book audio
      const audioUrl = await generateFullBookAudio(fullText);
      if (!audioUrl) return;

      // Setup and play audio
      setupAudio(audioUrl);
      setState((s) => ({ ...s, isLoading: true }));

      try {
        await audioRef.current?.play();
        setState((s) => ({
          ...s,
          isPlaying: true,
          isPaused: false,
          currentTime: 0,
        }));
      } catch (err) {
        log("Play error:", err);
        toast.error("Failed to play audio");
      }
    },
    [generateFullBookAudio, setupAudio]
  );

  // Pause playback
  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState((s) => ({ ...s, isPaused: true }));
  }, []);

  // Resume playback
  const resume = useCallback(() => {
    audioRef.current
      ?.play()
      .catch((err) => {
        log("Resume error:", err);
      });
    setState((s) => ({ ...s, isPaused: false }));
  }, []);

  // Stop playback completely
  const stop = useCallback(() => {
    isActiveRef.current = false;
    cleanupAudio();
    currentAudioUrlRef.current = null;
    setState({
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      duration: 0,
      playbackRate: rateRef.current,
      isLoading: false,
      isGenerating: false,
      error: null,
    });
  }, [cleanupAudio]);

  // Seek to specific time
  const seekToTime = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration));
    }
  }, []);

  // Set playback rate
  const setSpeed = useCallback((speed: PremiumTTSSpeed) => {
    rateRef.current = speed;
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setState((s) => ({ ...s, playbackRate: speed }));
  }, []);

  // Skip forward/backward (by seconds)
  const skipForward = useCallback((seconds = 10) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.currentTime + seconds,
        audioRef.current.duration
      );
    }
  }, []);

  const skipBackward = useCallback((seconds = 10) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(audioRef.current.currentTime - seconds, 0);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // Return compatible API with old usePremiumTTS signature
  return {
    ...state,
    // Compatibility with old API
    currentSentenceIndex: state.currentTime > 0 ? 0 : -1,
    totalSentences: state.duration > 0 ? 1 : 0,
    currentEmotion: "neutral" as const,
    elapsedSeconds: state.currentTime,
    totalDurationSeconds: state.duration,
    currentSegmentText: rawTextRef.current.substring(0, 100),
    isBuffering: state.isLoading,
    // New methods
    play,
    playFromIndex: play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    seekToIndex: seekToTime,
    setSpeed,
    rawText: rawTextRef.current,
  };
}
