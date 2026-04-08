import { useState, useRef, useCallback, useEffect } from "react";
import {
  createAmbientAudio,
  createRealAudio,
  disposeNodes,
  startRealPlayback,
  pauseRealPlayback,
  probeRealAudio,
  unlockAudioContext,
  isAudioUnlocked,
  bgLog,
  type AmbientGenre,
  type AudioNodes,
} from "@/lib/ambientAudioGenerator";

export type MusicGenre = AmbientGenre;

const VALID_GENRES = new Set<MusicGenre>(["horror", "romance", "calm", "suspense", "adventure"]);

/**
 * Maps book category/tag strings to a music genre.
 */
export function detectMusicGenre(
  category?: string | null,
  tags?: string[] | null
): MusicGenre {
  const haystack = [category, ...(tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/horror|ভয়|আতঙ্ক|ভূত|গা শিউরে|ভৌতিক/.test(haystack)) return "horror";
  if (/romance|রোমান্স|ভালোবাসা|প্রেম|রোমান্টিক/.test(haystack)) return "romance";
  if (/suspense|thriller|রহস্য|থ্রিলার|গোয়েন্দা/.test(haystack)) return "suspense";
  if (/adventure|অ্যাডভেঞ্চার|যুদ্ধ|সংগ্রাম|অভিযান/.test(haystack)) return "adventure";
  return "calm";
}

// ---- localStorage persistence helpers ----

const LS_KEY = "bgmusic_prefs";

interface BgMusicPrefs {
  enabled: boolean;
  genre: MusicGenre | null;
  volume: number;
  muted: boolean;
}

function loadPrefs(): BgMusicPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: !!parsed.enabled,
        genre: VALID_GENRES.has(parsed.genre) ? parsed.genre : null,
        volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(0.30, parsed.volume)) : 0.15,
        muted: !!parsed.muted,
      };
    }
  } catch { /* ignore */ }
  return { enabled: false, genre: null, volume: 0.15, muted: false };
}

export function savePrefs(prefs: Partial<BgMusicPrefs>) {
  try {
    const current = loadPrefs();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch { /* ignore */ }
}

export function getSavedPrefs(): BgMusicPrefs {
  return loadPrefs();
}

// ---- Hook ----

interface MusicState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  genre: MusicGenre;
  available: boolean;
  needsUnlock: boolean;
  /** Whether real MP3 is being used (vs synthetic fallback) */
  isRealAudio: boolean;
}

let activeAudioId = 0;

export function useBackgroundMusic(genre: MusicGenre = "calm") {
  const instanceId = useRef(0);
  const desiredPlayingRef = useRef(false);

  const [state, setState] = useState<MusicState>(() => {
    const prefs = loadPrefs();
    return {
      isPlaying: false,
      isMuted: prefs.muted,
      volume: prefs.volume,
      genre,
      available: false,
      needsUnlock: false,
      isRealAudio: false,
    };
  });

  const nodesRef = useRef<AudioNodes | null>(null);
  const faderId = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const volumeRef = useRef(state.volume);
  const mutedRef = useRef(state.isMuted);
  const genreRef = useRef(genre);
  const hasRealAudioRef = useRef(false);
  volumeRef.current = state.volume;
  mutedRef.current = state.isMuted;
  genreRef.current = genre;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSetState = useCallback((updater: (s: MusicState) => MusicState) => {
    if (mountedRef.current) setState(updater);
  }, []);

  const clearFader = useCallback(() => {
    if (faderId.current) {
      clearInterval(faderId.current);
      faderId.current = null;
    }
  }, []);

  const ensureNodes = useCallback((reason: string) => {
    if (!nodesRef.current) {
      const g = genreRef.current;
      if (hasRealAudioRef.current) {
        bgLog(`${reason}: creating REAL audio source`, { genre: g });
        nodesRef.current = createRealAudio(g);
      } else {
        bgLog(`${reason}: creating SYNTHETIC audio source`, { genre: g });
        nodesRef.current = createAmbientAudio(g);
      }
    }
    return nodesRef.current;
  }, []);

  /* ── Fade helpers ──────────────────────────────────────────────── */

  const beginFadeIn = useCallback((durationMs = 2000) => {
    const nodes = ensureNodes("fadeIn");
    const target = mutedRef.current ? 0 : volumeRef.current;
    bgLog(`fadeIn → target: ${target}, type: ${nodes.type}`);

    if (target <= 0) {
      nodes.gainNode.gain.value = 0;
      return;
    }

    nodes.gainNode.gain.value = 0;
    const steps = Math.max(durationMs / 50, 1);
    const step = target / steps;
    clearFader();

    // For real audio, start playback
    if (nodes.type === "real") {
      void startRealPlayback(nodes);
    }

    faderId.current = setInterval(() => {
      const n = nodesRef.current;
      if (!n) { clearFader(); return; }
      const next = Math.min(n.gainNode.gain.value + step, target);
      n.gainNode.gain.value = next;
      if (next >= target) clearFader();
    }, 50);
  }, [clearFader, ensureNodes]);

  const fadeOut = useCallback((durationMs = 1200) => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    const currentVol = nodes.gainNode.gain.value;
    if (currentVol <= 0) {
      if (nodes.type === "real") pauseRealPlayback(nodes);
      else nodes.ctx.suspend().catch(() => {});
      return;
    }
    const steps = Math.max(durationMs / 50, 1);
    const step = currentVol / steps;
    clearFader();
    faderId.current = setInterval(() => {
      const n = nodesRef.current;
      if (!n) { clearFader(); return; }
      const next = Math.max(n.gainNode.gain.value - step, 0);
      n.gainNode.gain.value = next;
      if (next <= 0) {
        if (n.type === "real") pauseRealPlayback(n);
        else n.ctx.suspend().catch(() => {});
        clearFader();
      }
    }, 50);
  }, [clearFader]);

  /* ── Attempt to start playback ─────────────────────────────────── */

  const attemptPlay = useCallback(async () => {
    const unlocked = await unlockAudioContext();
    if (!unlocked) {
      bgLog("attemptPlay: AudioContext still locked");
      safeSetState((s) => ({ ...s, needsUnlock: true }));
      return false;
    }
    safeSetState((s) => ({ ...s, needsUnlock: false }));
    ensureNodes("attemptPlay");
    beginFadeIn();
    safeSetState((s) => ({ ...s, isPlaying: true }));
    return true;
  }, [beginFadeIn, ensureNodes, safeSetState]);

  /* ── Global user-gesture unlock listener ───────────────────────── */

  useEffect(() => {
    const onUserGesture = async () => {
      const wasLocked = !isAudioUnlocked();
      const nowUnlocked = await unlockAudioContext();

      if (wasLocked && nowUnlocked) {
        bgLog("Global gesture unlocked AudioContext");
      }

      if (nowUnlocked && desiredPlayingRef.current && mountedRef.current) {
        safeSetState((s) => ({ ...s, needsUnlock: false }));
        ensureNodes("gestureRetry");
        beginFadeIn(800);
        safeSetState((s) => ({ ...s, isPlaying: true }));
      }
    };

    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", onUserGesture, opts);
    window.addEventListener("touchstart", onUserGesture, opts);
    window.addEventListener("click", onUserGesture, opts);
    window.addEventListener("keydown", onUserGesture, opts);

    return () => {
      window.removeEventListener("pointerdown", onUserGesture);
      window.removeEventListener("touchstart", onUserGesture);
      window.removeEventListener("click", onUserGesture);
      window.removeEventListener("keydown", onUserGesture);
    };
  }, [beginFadeIn, ensureNodes, safeSetState]);

  /* ── Tab visibility: suspend/resume ────────────────────────────── */

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.hidden) {
        if (nodesRef.current) {
          if (nodesRef.current.type === "real") {
            pauseRealPlayback(nodesRef.current);
          } else if (nodesRef.current.ctx.state === "running") {
            nodesRef.current.ctx.suspend().catch(() => {});
          }
          bgLog("Suspended (tab hidden)");
        }
      } else {
        if (desiredPlayingRef.current && nodesRef.current) {
          try {
            if (nodesRef.current.type === "real") {
              await nodesRef.current.ctx.resume();
              void startRealPlayback(nodesRef.current);
            } else {
              await nodesRef.current.ctx.resume();
            }
            bgLog("Resumed (tab visible)");
          } catch { /* ignore */ }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  /* ── Genre change: probe for real audio, dispose old nodes ─────── */

  useEffect(() => {
    const myId = ++activeAudioId;
    instanceId.current = myId;
    desiredPlayingRef.current = false;

    if (nodesRef.current) {
      disposeNodes(nodesRef.current);
      nodesRef.current = null;
    }
    clearFader();

    // Probe for real MP3 file
    safeSetState((s) => ({ ...s, genre, isPlaying: false, available: false, needsUnlock: false, isRealAudio: false }));

    probeRealAudio(genre).then((hasReal) => {
      if (instanceId.current !== myId || !mountedRef.current) return;
      hasRealAudioRef.current = hasReal;
      bgLog(`Genre "${genre}" ready — ${hasReal ? "REAL MP3" : "SYNTHETIC fallback"}`);
      safeSetState((s) => ({ ...s, available: true, isRealAudio: hasReal }));
    });

    return () => {
      if (nodesRef.current) {
        disposeNodes(nodesRef.current);
        nodesRef.current = null;
      }
      clearFader();
    };
  }, [genre, clearFader, safeSetState]);

  // Keep volume in sync
  useEffect(() => {
    if (nodesRef.current && !faderId.current) {
      const targetVol = state.isMuted ? 0 : state.volume;
      nodesRef.current.gainNode.gain.value = targetVol;
    }
  }, [state.volume, state.isMuted]);

  /* ── Public API ──────────────────────────────────────────────── */

  const play = useCallback(() => {
    desiredPlayingRef.current = true;
    bgLog("play() called");
    void attemptPlay();
  }, [attemptPlay]);

  const pause = useCallback(() => {
    desiredPlayingRef.current = false;
    bgLog("pause()");
    fadeOut();
    safeSetState((s) => ({ ...s, isPlaying: false, needsUnlock: false }));
  }, [fadeOut, safeSetState]);

  const stop = useCallback(() => {
    desiredPlayingRef.current = false;
    bgLog("stop()");
    clearFader();
    if (nodesRef.current) {
      nodesRef.current.gainNode.gain.value = 0;
      if (nodesRef.current.type === "real") {
        pauseRealPlayback(nodesRef.current);
      } else {
        nodesRef.current.ctx.suspend().catch(() => {});
      }
    }
    safeSetState((s) => ({ ...s, isPlaying: false, needsUnlock: false }));
  }, [clearFader, safeSetState]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(0.30, v));
    safeSetState((s) => ({ ...s, volume: clamped }));
    savePrefs({ volume: clamped });
  }, [safeSetState]);

  const toggleMute = useCallback(() => {
    safeSetState((s) => {
      const newMuted = !s.isMuted;
      savePrefs({ muted: newMuted });
      return { ...s, isMuted: newMuted };
    });
  }, [safeSetState]);

  const manualUnlock = useCallback(async () => {
    const ok = await unlockAudioContext();
    if (ok && desiredPlayingRef.current) {
      ensureNodes("manualUnlock");
      beginFadeIn(800);
      safeSetState((s) => ({ ...s, isPlaying: true, needsUnlock: false }));
    } else {
      safeSetState((s) => ({ ...s, needsUnlock: !ok }));
    }
  }, [beginFadeIn, ensureNodes, safeSetState]);

  return { ...state, play, pause, stop, setVolume, toggleMute, manualUnlock };
}
