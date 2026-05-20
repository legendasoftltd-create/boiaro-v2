import { useState, useRef, useCallback, useEffect } from "react";
import {
  createAmbientAudio,
  createRealAudio,
  disposeNodes,
  startRealPlayback,
  pauseRealPlayback,
  probeRealAudio,
  getSharedAudioContext,
  bgLog,
  SYNTHETIC_GENRES,
  type AudioNodes,
} from "@/lib/ambientAudioGenerator";

export type MusicGenre = string;

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

// ── localStorage persistence ──────────────────────────────────────────────────

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
        genre: typeof parsed.genre === "string" && parsed.genre.length > 0 ? parsed.genre : null,
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

// ── Hook ──────────────────────────────────────────────────────────────────────

interface MusicState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  genre: MusicGenre;
  available: boolean;
  needsUnlock: boolean;
  isRealAudio: boolean;
}

let activeAudioId = 0;

export function useBackgroundMusic(genre: MusicGenre = "calm") {
  const instanceId = useRef(0);
  const desiredPlayingRef = useRef(false);
  const nodesRef = useRef<AudioNodes | null>(null);
  const faderId = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const volumeRef = useRef(loadPrefs().volume);
  const mutedRef = useRef(loadPrefs().muted);
  const genreRef = useRef(genre);
  const hasRealAudioRef = useRef(false);

  genreRef.current = genre;

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
  volumeRef.current = state.volume;
  mutedRef.current = state.isMuted;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSetState = useCallback((updater: (s: MusicState) => MusicState) => {
    if (mountedRef.current) setState(updater);
  }, []);

  const clearFader = useCallback(() => {
    if (faderId.current) { clearInterval(faderId.current); faderId.current = null; }
  }, []);

  // ── Core: build audio nodes ─────────────────────────────────────────────────

  const buildNodes = useCallback((g: string): AudioNodes | null => {
    if (nodesRef.current) return nodesRef.current;

    if (hasRealAudioRef.current) {
      bgLog("buildNodes: REAL audio", { genre: g });
      const nodes = createRealAudio(g, () => {
        // Real audio failed — fall back to synthetic
        bgLog("Real audio error — switching to synthetic");
        hasRealAudioRef.current = false;
        if (nodesRef.current?.type === "real") {
          disposeNodes(nodesRef.current);
          nodesRef.current = null;
        }
        if (SYNTHETIC_GENRES.has(genreRef.current) && desiredPlayingRef.current) {
          const synthNodes = createAmbientAudio(genreRef.current);
          nodesRef.current = synthNodes;
          safeSetState((s) => ({ ...s, isRealAudio: false }));
          // Resume context then fade in
          const ctx = synthNodes.ctx;
          const resume = ctx.state !== "running" ? ctx.resume() : Promise.resolve();
          resume.then(() => {
            if (!desiredPlayingRef.current || !nodesRef.current) return;
            startFade(nodesRef.current, mutedRef.current ? 0 : volumeRef.current, 800);
          }).catch(() => {});
        }
      });
      nodesRef.current = nodes;
      return nodes;
    }

    if (SYNTHETIC_GENRES.has(g)) {
      bgLog("buildNodes: SYNTHETIC audio", { genre: g });
      const nodes = createAmbientAudio(g);
      nodesRef.current = nodes;
      return nodes;
    }

    return null;
  }, [safeSetState]);

  // ── Fade helpers ────────────────────────────────────────────────────────────

  function startFade(nodes: AudioNodes, target: number, durationMs = 2000) {
    if (target <= 0) {
      nodes.gainNode.gain.value = 0;
      return;
    }
    // Skip if already at target and no active fader
    if (nodes.gainNode.gain.value >= target && !faderId.current) return;

    nodes.gainNode.gain.value = 0;
    const steps = Math.max(durationMs / 50, 1);
    const step = target / steps;
    if (faderId.current) { clearInterval(faderId.current); faderId.current = null; }
    faderId.current = setInterval(() => {
      const n = nodesRef.current;
      if (!n) { clearInterval(faderId.current!); faderId.current = null; return; }
      const next = Math.min(n.gainNode.gain.value + step, target);
      n.gainNode.gain.value = next;
      if (next >= target) { clearInterval(faderId.current!); faderId.current = null; }
    }, 50);
  }

  function stopFade(nodes: AudioNodes, durationMs = 1200) {
    const currentVol = nodes.gainNode.gain.value;
    if (currentVol <= 0) {
      if (nodes.type === "real") pauseRealPlayback(nodes);
      else nodes.ctx.suspend().catch(() => {});
      return;
    }
    const steps = Math.max(durationMs / 50, 1);
    const step = currentVol / steps;
    if (faderId.current) { clearInterval(faderId.current); faderId.current = null; }
    faderId.current = setInterval(() => {
      const n = nodesRef.current;
      if (!n) { clearInterval(faderId.current!); faderId.current = null; return; }
      const next = Math.max(n.gainNode.gain.value - step, 0);
      n.gainNode.gain.value = next;
      if (next <= 0) {
        if (n.type === "real") pauseRealPlayback(n);
        else n.ctx.suspend().catch(() => {});
        clearInterval(faderId.current!); faderId.current = null;
      }
    }, 50);
  }

  // ── play() — MUST be called in user gesture context ─────────────────────────
  // We call ctx.resume() and audio.play() synchronously here (before any await)
  // so Chrome's autoplay policy is satisfied.

  const play = useCallback(() => {
    desiredPlayingRef.current = true;
    bgLog("play() called");

    const g = genreRef.current;
    const nodes = buildNodes(g);
    if (!nodes) {
      bgLog("play(): no nodes available");
      return;
    }

    const ctx = getSharedAudioContext();
    const target = mutedRef.current ? 0 : volumeRef.current;

    // Resume AudioContext synchronously (user gesture context)
    if (ctx.state !== "running") {
      ctx.resume().catch(() => { bgLog("ctx.resume failed"); });
    }

    // For real audio: call play() synchronously (user gesture context)
    if (nodes.type === "real") {
      startRealPlayback(nodes).catch(() => {
        bgLog("audio.play() rejected — switching to synthetic");
        // Autoplay blocked — dispose and use synthetic
        disposeNodes(nodes);
        nodesRef.current = null;
        hasRealAudioRef.current = false;
        if (SYNTHETIC_GENRES.has(g) && desiredPlayingRef.current) {
          const synthNodes = createAmbientAudio(g);
          nodesRef.current = synthNodes;
          safeSetState((s) => ({ ...s, isRealAudio: false }));
          ctx.resume().then(() => {
            if (desiredPlayingRef.current && nodesRef.current) {
              startFade(nodesRef.current, target, 800);
            }
          }).catch(() => {});
        }
      });
    }

    // Start fade (works for both real and synthetic)
    startFade(nodes, target);
    safeSetState((s) => ({ ...s, isPlaying: true, needsUnlock: false }));
  }, [buildNodes, safeSetState]);

  const pause = useCallback(() => {
    desiredPlayingRef.current = false;
    bgLog("pause()");
    if (nodesRef.current) stopFade(nodesRef.current);
    safeSetState((s) => ({ ...s, isPlaying: false }));
  }, [safeSetState]);

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

  // ── Genre change effect ─────────────────────────────────────────────────────

  useEffect(() => {
    const myId = ++activeAudioId;
    instanceId.current = myId;
    desiredPlayingRef.current = false;

    clearFader();
    if (nodesRef.current) { disposeNodes(nodesRef.current); nodesRef.current = null; }

    safeSetState((s) => ({ ...s, genre, isPlaying: false, available: false, needsUnlock: false, isRealAudio: false }));

    probeRealAudio(genre).then((hasReal) => {
      if (instanceId.current !== myId || !mountedRef.current) return;
      hasRealAudioRef.current = hasReal;
      const hasSynthetic = SYNTHETIC_GENRES.has(genre);
      bgLog(`Genre "${genre}" — ${hasReal ? "REAL MP3" : hasSynthetic ? "SYNTHETIC" : "UNAVAILABLE"}`);
      safeSetState((s) => ({ ...s, available: hasReal || hasSynthetic, isRealAudio: hasReal }));
    });

    return () => {
      clearFader();
      if (nodesRef.current) { disposeNodes(nodesRef.current); nodesRef.current = null; }
    };
  }, [genre, clearFader, safeSetState]);

  // ── Tab visibility ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (nodesRef.current) {
          if (nodesRef.current.type === "real") pauseRealPlayback(nodesRef.current);
          else nodesRef.current.ctx.suspend().catch(() => {});
        }
      } else if (desiredPlayingRef.current && nodesRef.current) {
        if (nodesRef.current.type === "real") {
          nodesRef.current.ctx.resume().then(() => {
            if (nodesRef.current?.type === "real") void startRealPlayback(nodesRef.current);
          }).catch(() => {});
        } else {
          nodesRef.current.ctx.resume().catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ── Volume sync ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (nodesRef.current && !faderId.current) {
      nodesRef.current.gainNode.gain.value = state.isMuted ? 0 : state.volume;
    }
  }, [state.volume, state.isMuted]);

  // ── Public setters ──────────────────────────────────────────────────────────

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

  const manualUnlock = useCallback(() => {
    // Called directly by user tap — use as gesture to start playback
    if (desiredPlayingRef.current) play();
    else safeSetState((s) => ({ ...s, needsUnlock: false }));
  }, [play, safeSetState]);

  return { ...state, play, pause, stop, setVolume, toggleMute, manualUnlock };
}
