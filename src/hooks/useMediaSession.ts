import { useEffect } from "react";

interface MediaSessionOptions {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  isPlaying: boolean;
  isPaused: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
}

/**
 * Integrates with the Media Session API for lock-screen / notification controls.
 * Also keeps a silent audio element alive to enable background TTS playback.
 */
export function useMediaSession({
  title, artist, album, artwork,
  isPlaying, isPaused,
  onPlay, onPause, onStop,
  onNextTrack, onPreviousTrack,
  onSeekForward, onSeekBackward,
}: MediaSessionOptions) {
  // Keep a silent audio element playing to maintain background audio session
  useEffect(() => {
    if (!isPlaying) return;

    // Create a silent audio context to keep the audio session alive
    let audioCtx: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      oscillator = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.001; // Nearly silent
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
    } catch {
      // AudioContext not available
    }

    return () => {
      try {
        oscillator?.stop();
        audioCtx?.close();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [isPlaying]);

  // Set up Media Session metadata and handlers
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if (isPlaying) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: artist || "TTS Reader",
        album: album || "eBook",
        artwork: artwork
          ? [
              { src: artwork, sizes: "96x96", type: "image/jpeg" },
              { src: artwork, sizes: "128x128", type: "image/jpeg" },
              { src: artwork, sizes: "256x256", type: "image/jpeg" },
              { src: artwork, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      });

      navigator.mediaSession.playbackState = isPaused ? "paused" : "playing";
    }
  }, [title, artist, album, artwork, isPlaying, isPaused]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const handlers: [MediaSessionAction, (() => void) | undefined][] = [
      ["play", onPlay],
      ["pause", onPause],
      ["stop", onStop],
      ["nexttrack", onNextTrack],
      ["previoustrack", onPreviousTrack],
      ["seekforward", onSeekForward],
      ["seekbackward", onSeekBackward],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler || null);
      } catch {
        // Some actions not supported
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore
        }
      }
    };
  }, [onPlay, onPause, onStop, onNextTrack, onPreviousTrack, onSeekForward, onSeekBackward]);
}
