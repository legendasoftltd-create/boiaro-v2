import { useEffect, useRef } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import {
  useBackgroundMusic,
  detectMusicGenre,
  type MusicGenre,
} from "@/hooks/useBackgroundMusic";

interface AudiobookBgMusicProps {
  genreOverride?: MusicGenre;
  enabled: boolean;
}

/**
 * Hook that syncs background music with the audiobook player.
 *
 * Hardened for:
 * - No music without active narration
 * - Clean stop on chapter change, book change, unmount
 * - Mobile autoplay handled gracefully
 * - Stable refs to avoid unnecessary re-renders
 * - Debounced chapter transitions for rapid switching
 * - Tab visibility awareness
 */
export function useAudiobookBackgroundMusic({
  genreOverride,
  enabled,
}: AudiobookBgMusicProps) {
  const { book, isPlaying, currentTrackIndex } = useAudioPlayer();
  const prevPlayingRef = useRef(false);
  const prevTrackRef = useRef(currentTrackIndex);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const chapterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detectedGenre: MusicGenre =
    genreOverride ?? detectMusicGenre(book?.category?.name, book?.tags);

  const bgMusic = useBackgroundMusic(detectedGenre);

  // Stable refs for bgMusic callbacks
  const bgPlayRef = useRef(bgMusic.play);
  const bgPauseRef = useRef(bgMusic.pause);
  const bgStopRef = useRef(bgMusic.stop);
  bgPlayRef.current = bgMusic.play;
  bgPauseRef.current = bgMusic.pause;
  bgStopRef.current = bgMusic.stop;

  // Core sync: narration play/pause → music play/pause
  useEffect(() => {
    if (!enabledRef.current || !bgMusic.available) {
      prevPlayingRef.current = isPlaying;
      return;
    }

    const wasPlaying = prevPlayingRef.current;
    prevPlayingRef.current = isPlaying;

    if (isPlaying && !wasPlaying) {
      bgPlayRef.current();
    } else if (!isPlaying && wasPlaying) {
      bgPauseRef.current();
    }
  }, [isPlaying, bgMusic.available]);

  // Stop music when user disables the feature
  useEffect(() => {
    if (!enabled) {
      bgStopRef.current();
    }
  }, [enabled]);

  // Start immediately if music is enabled while narration is already active
  useEffect(() => {
    if (enabled && isPlaying && bgMusic.available) {
      bgPlayRef.current();
    }
  }, [enabled, isPlaying, bgMusic.available]);

  // On chapter change: debounced stop + restart to handle rapid switching
  useEffect(() => {
    if (prevTrackRef.current !== currentTrackIndex) {
      prevTrackRef.current = currentTrackIndex;

      // Clear any pending chapter transition timer (rapid switching protection)
      if (chapterTimerRef.current) {
        clearTimeout(chapterTimerRef.current);
        chapterTimerRef.current = null;
      }

      if (enabledRef.current && bgMusic.available) {
        bgStopRef.current();
        if (isPlaying) {
          // Debounce: wait 500ms before restarting so rapid chapter switches
          // don't cause overlapping fade-ins
          chapterTimerRef.current = setTimeout(() => {
            chapterTimerRef.current = null;
            if (enabledRef.current) bgPlayRef.current();
          }, 500);
        }
      }
    }
  }, [currentTrackIndex, isPlaying, bgMusic.available]);

  // Cleanup chapter timer on unmount
  useEffect(() => {
    return () => {
      if (chapterTimerRef.current) {
        clearTimeout(chapterTimerRef.current);
        chapterTimerRef.current = null;
      }
    };
  }, []);

  // Cleanup when book changes
  const bookId = book?.id;
  useEffect(() => {
    return () => {
      bgStopRef.current();
      if (chapterTimerRef.current) {
        clearTimeout(chapterTimerRef.current);
        chapterTimerRef.current = null;
      }
    };
  }, [bookId]);

  // Safety: if narration is NOT playing, music must NOT be playing
  useEffect(() => {
    if (!isPlaying && bgMusic.isPlaying) {
      bgStopRef.current();
    }
  }, [isPlaying, bgMusic.isPlaying]);

  return {
    genre: detectedGenre,
    musicAvailable: bgMusic.available,
    musicPlaying: bgMusic.isPlaying,
    musicMuted: bgMusic.isMuted,
    musicVolume: bgMusic.volume,
    toggleMute: bgMusic.toggleMute,
    setMusicVolume: bgMusic.setVolume,
    stopMusic: bgMusic.stop,
    needsUnlock: bgMusic.needsUnlock,
    manualUnlock: bgMusic.manualUnlock,
    isRealAudio: bgMusic.isRealAudio,
  };
}
