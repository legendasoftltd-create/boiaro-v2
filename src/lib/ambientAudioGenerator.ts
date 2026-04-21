/**
 * Background music system with real MP3 support + synthetic fallback.
 *
 * Priority: Real MP3 from storage → Synthetic oscillator fallback
 *
 * Real audio files are expected at:
 *   {SUPABASE_URL}/storage/v1/object/public/background-music/{genre}.mp3
 *
 * If the file doesn't exist or fails to load, the system falls back to
 * the original Web Audio API oscillator-based ambient sound.
 */

export type AmbientGenre = "horror" | "romance" | "calm" | "suspense" | "adventure";

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

/* ── Storage URL helper ────────────────────────────────────────── */

function getSupabaseUrl(): string {
  // Background music storage not configured — falls back to oscillator
  return "";
}

function getMusicFileUrl(genre: AmbientGenre): string {
  const base = getSupabaseUrl();
  if (!base) return "";
  return `${base}/storage/v1/object/public/background-music/${genre}.mp3`;
}

/* ── Real audio file cache ─────────────────────────────────────── */

const _fileAvailability = new Map<AmbientGenre, "unknown" | "available" | "unavailable">();
const _audioElements = new Map<AmbientGenre, HTMLAudioElement>();

/**
 * Probe whether a real MP3 file exists for the genre.
 * Results are cached so we only check once per session.
 */
export async function probeRealAudio(genre: AmbientGenre): Promise<boolean> {
  const cached = _fileAvailability.get(genre);
  if (cached === "available") return true;
  if (cached === "unavailable") return false;

  const url = getMusicFileUrl(genre);
  if (!url) {
    _fileAvailability.set(genre, "unavailable");
    return false;
  }

  try {
    const resp = await fetch(url, { method: "HEAD" });
    const ct = resp.headers.get("content-type") || "";
    // Accept audio/* MIME types OR octet-stream (storage may not set correct MIME)
    const ok = resp.ok && (ct.includes("audio") || ct.includes("octet-stream"));
    _fileAvailability.set(genre, ok ? "available" : "unavailable");
    bgLog(`Probe ${genre}.mp3: ${ok ? "FOUND" : "NOT FOUND"} (${resp.status})`);
    return ok;
  } catch {
    _fileAvailability.set(genre, "unavailable");
    bgLog(`Probe ${genre}.mp3: FAILED (network error)`);
    return false;
  }
}

/* ── Real audio nodes (HTML Audio → Web Audio for volume control) */

export interface RealAudioNodes {
  type: "real";
  ctx: AudioContext;
  gainNode: GainNode;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
}

export function createRealAudio(genre: AmbientGenre): RealAudioNodes {
  const ctx = getSharedAudioContext();
  const url = getMusicFileUrl(genre);

  // Reuse or create audio element
  let audio = _audioElements.get(genre);
  if (!audio) {
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    audio.preload = "auto";
    _audioElements.set(genre, audio);
  }
  audio.src = url;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0;
  gainNode.connect(ctx.destination);

  // MediaElementSource can only be created once per element
  let source: MediaElementAudioSourceNode;
  try {
    source = ctx.createMediaElementSource(audio);
  } catch {
    // Already connected — disconnect and reconnect gain
    // This happens when switching genres back to a previously used one
    bgLog(`Reusing existing MediaElementSource for ${genre}`);
    // We need a fresh audio element in this case
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    audio.preload = "auto";
    audio.src = url;
    _audioElements.set(genre, audio);
    source = ctx.createMediaElementSource(audio);
  }

  source.connect(gainNode);

  bgLog(`Created REAL audio: genre=${genre}, url=${url}`);
  return { type: "real", ctx, gainNode, audio, source };
}

export function disposeRealAudio(nodes: RealAudioNodes) {
  try {
    nodes.audio.pause();
    nodes.audio.removeAttribute("src");
    nodes.audio.load();
    nodes.gainNode.disconnect();
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

export function createAmbientAudio(genre: AmbientGenre): SyntheticAudioNodes {
  const ctx = getSharedAudioContext();
  const config = GENRE_CONFIG[genre];

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
