/**
 * Background music system with real MP3 support + synthetic fallback.
 *
 * Priority: Real MP3 URL from admin config → Synthetic oscillator fallback
 * (synthetic only available for the 5 built-in genre IDs)
 */

export type AmbientGenre = "horror" | "romance" | "calm" | "suspense" | "adventure";

export interface AmbientTrack {
  id: string;
  name: string;
  label: string;
  emoji: string;
  url: string;
  enabled: boolean;
}

// Built-in genres that support synthetic oscillator fallback
export const SYNTHETIC_GENRES = new Set<string>(["calm", "romance", "horror", "suspense", "adventure"]);

// Default track list (matches server DEFAULT_AMBIENT_TRACKS)
export const DEFAULT_AMBIENT_TRACKS: AmbientTrack[] = [
  { id: "calm",      name: "Calm",      label: "শান্ত",        emoji: "🌿", url: "", enabled: true },
  { id: "romance",   name: "Romance",   label: "রোমান্স",       emoji: "💕", url: "", enabled: true },
  { id: "horror",    name: "Horror",    label: "ভৌতিক",        emoji: "👻", url: "", enabled: true },
  { id: "suspense",  name: "Suspense",  label: "সাসপেন্স",     emoji: "⚡", url: "", enabled: true },
  { id: "adventure", name: "Adventure", label: "অ্যাডভেঞ্চার", emoji: "⚔️", url: "", enabled: true },
];

// Module-level dynamic track registry (set from EbookReader after API fetch)
let _dynamicTracks: AmbientTrack[] | null = null;

export function setAmbientTracks(tracks: AmbientTrack[]) {
  _dynamicTracks = tracks;
  _fileAvailability.clear(); // re-probe with new URLs
}

export function getAmbientTracks(): AmbientTrack[] {
  return _dynamicTracks ?? DEFAULT_AMBIENT_TRACKS;
}

export const BG_MUSIC_DEBUG = true;

export function bgLog(...args: unknown[]) {
  if (BG_MUSIC_DEBUG) console.log("[BgMusic]", ...args);
}

/* ── Singleton AudioContext (mobile-safe) ──────────────────────── */

let _sharedCtx: AudioContext | null = null;
let _unlocked = false;

export function getSharedAudioContext(): AudioContext {
  if (!_sharedCtx || ["closed", "interrupted"].includes(_sharedCtx.state)) {
    _sharedCtx = new AudioContext();
    _unlocked = false;
    bgLog("Shared AudioContext created, state:", _sharedCtx.state);
  }
  return _sharedCtx;
}

export async function unlockAudioContext(): Promise<boolean> {
  const ctx = getSharedAudioContext();
  if (ctx.state === "running") {
    _unlocked = true;
    return true;
  }
  try {
    await ctx.resume();
    _unlocked = (ctx.state as string) === "running";
    bgLog("unlockAudioContext result:", ctx.state);
    return _unlocked;
  } catch (err) {
    bgLog("unlockAudioContext failed:", err);
    return false;
  }
}

export function isAudioUnlocked(): boolean {
  return _unlocked && !!_sharedCtx && _sharedCtx.state === "running";
}

/* ── Storage URL helper (uses dynamic track config) ───────────── */

function getMusicFileUrl(trackId: string): string {
  const tracks = getAmbientTracks();
  const track = tracks.find(t => t.id === trackId);
  return track?.url ?? "";
}

/* ── Real audio file cache ─────────────────────────────────────── */

const _fileAvailability = new Map<string, "unknown" | "available" | "unavailable">();
const _audioElements = new Map<string, HTMLAudioElement>();

/**
 * Probe whether a real MP3 file exists for a track.
 * Results are cached so we only check once per session.
 * Call setAmbientTracks() first to register URLs from the API.
 */
export async function probeRealAudio(trackId: string): Promise<boolean> {
  const cached = _fileAvailability.get(trackId);
  if (cached === "available") return true;
  if (cached === "unavailable") return false;

  const url = getMusicFileUrl(trackId);
  if (!url) {
    _fileAvailability.set(trackId, "unavailable");
    return false;
  }

  try {
    const resp = await fetch(url, { method: "HEAD" });
    const ct = resp.headers.get("content-type") || "";
    // Accept audio/* MIME types OR octet-stream (storage may not set correct MIME)
    const ok = resp.ok && (ct.includes("audio") || ct.includes("octet-stream"));
    _fileAvailability.set(trackId, ok ? "available" : "unavailable");
    bgLog(`Probe ${trackId}: ${ok ? "FOUND" : "NOT FOUND"} (${resp.status})`);
    return ok;
  } catch {
    _fileAvailability.set(trackId, "unavailable");
    bgLog(`Probe ${trackId}: FAILED (network error)`);
    return false;
  }
}

/* ── Real audio nodes (plain HTMLAudioElement, no Web Audio API) ───────────
 * Using createMediaElementSource() requires crossOrigin="anonymous" which
 * can fail with SecurityError when the browser has the file cached from a
 * non-CORS context (e.g. direct URL open, CDN, another tab).
 * Fix: control volume directly via audio.volume — no Web Audio graph needed.
 */

export interface RealAudioNodes {
  type: "real";
  ctx: AudioContext;
  gainNode: { gain: { value: number } };  // proxy to audio.volume
  audio: HTMLAudioElement;
}

export function createRealAudio(trackId: string): RealAudioNodes {
  const ctx = getSharedAudioContext();
  const url = getMusicFileUrl(trackId);

  let audio = _audioElements.get(trackId);
  if (!audio || audio.src !== url) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = url;
    _audioElements.set(trackId, audio);
  }

  // Proxy gainNode.gain.value → audio.volume so the rest of the hook works unchanged
  const gainNode = {
    gain: {
      get value() { return audio!.volume; },
      set value(v: number) { audio!.volume = Math.max(0, Math.min(1, v)); },
    },
  };

  bgLog(`Created REAL audio: trackId=${trackId}, url=${url}`);
  return { type: "real", ctx, gainNode, audio };
}

export function disposeRealAudio(nodes: RealAudioNodes) {
  try {
    nodes.audio.pause();
    nodes.audio.removeAttribute("src");
    nodes.audio.load();
    bgLog("Disposed real audio nodes");
  } catch { /* ignore */ }
}

/* ── Synthetic (oscillator) fallback ───────────────────────────── */

const GENRE_CONFIG: Record<AmbientGenre, {
  frequencies: number[];
  waveforms: OscillatorType[];
  filterFreq: number;
  lfoRate: number;
  lfoDepth: number;
  oscGain: number;
}> = {
  calm: {
    frequencies: [130.8, 164.8],
    waveforms: ["sine", "sine"],
    filterFreq: 350,
    lfoRate: 0.04,
    lfoDepth: 1.5,
    oscGain: 0.12,
  },
  romance: {
    frequencies: [196, 246.9, 293.7],
    waveforms: ["sine", "sine", "triangle"],
    filterFreq: 400,
    lfoRate: 0.06,
    lfoDepth: 2,
    oscGain: 0.1,
  },
  horror: {
    frequencies: [55, 77.8],
    waveforms: ["sine", "triangle"],
    filterFreq: 200,
    lfoRate: 0.03,
    lfoDepth: 3,
    oscGain: 0.1,
  },
  suspense: {
    frequencies: [164.8, 233.1],
    waveforms: ["sine", "triangle"],
    filterFreq: 300,
    lfoRate: 0.05,
    lfoDepth: 2.5,
    oscGain: 0.1,
  },
  adventure: {
    frequencies: [146.8, 220],
    waveforms: ["triangle", "sine"],
    filterFreq: 450,
    lfoRate: 0.08,
    lfoDepth: 2,
    oscGain: 0.12,
  },
};

export interface SyntheticAudioNodes {
  type: "synthetic";
  ctx: AudioContext;
  gainNode: GainNode;
  oscillators: OscillatorNode[];
  lfo: OscillatorNode;
}

export function createAmbientAudio(genre: string): SyntheticAudioNodes {
  const ctx = getSharedAudioContext();
  const config = GENRE_CONFIG[genre as AmbientGenre] ?? GENRE_CONFIG["calm"];

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0;
  gainNode.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = config.filterFreq;
  filter.Q.value = 0.7;
  filter.connect(gainNode);

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = config.lfoRate;
  lfo.type = "sine";
  lfoGain.gain.value = config.lfoDepth;
  lfo.connect(lfoGain);
  lfo.start();

  const perOscGain = config.oscGain / config.frequencies.length;
  const oscillators: OscillatorNode[] = config.frequencies.map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    osc.type = config.waveforms[i] || "sine";

    const oscGainNode = ctx.createGain();
    oscGainNode.gain.value = perOscGain;
    osc.connect(oscGainNode);
    oscGainNode.connect(filter);

    lfoGain.connect(osc.frequency);
    osc.start();
    return osc;
  });

  bgLog(`Created SYNTHETIC ambient audio: genre=${genre}, oscs=${oscillators.length}`);
  return { type: "synthetic", ctx, gainNode, oscillators, lfo };
}

export function disposeAmbientAudio(nodes: SyntheticAudioNodes) {
  try {
    nodes.oscillators.forEach((osc) => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
    try { nodes.lfo.stop(); } catch { /* already stopped */ }
    nodes.gainNode.disconnect();
    bgLog("Disposed synthetic ambient audio nodes");
  } catch { /* ignore */ }
}

/* ── Unified type ──────────────────────────────────────────────── */

export type AudioNodes = RealAudioNodes | SyntheticAudioNodes;

export function disposeNodes(nodes: AudioNodes) {
  if (nodes.type === "real") {
    disposeRealAudio(nodes);
  } else {
    disposeAmbientAudio(nodes);
  }
}

/**
 * Start actual audio playback for real audio nodes.
 * Must be called after fade-in sets gain > 0.
 */
export function startRealPlayback(nodes: RealAudioNodes): Promise<void> {
  return nodes.audio.play().catch((err) => {
    bgLog("Real audio play() failed:", err);
  });
}

/**
 * Pause real audio playback without disposing.
 */
export function pauseRealPlayback(nodes: RealAudioNodes) {
  nodes.audio.pause();
}
