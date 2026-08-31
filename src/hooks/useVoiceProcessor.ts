import { useCallback, useRef, useState } from "react";

/**
 * How the RJ is listening, which decides the mic capture constraints.
 *
 * "headphones" is the correct way to broadcast and turns the browser's echo
 * cancellation and noise suppression off, keeping the mic wideband and leaving
 * the music bed and callers untouched. "speaker" keeps them on, because
 * without headphones the speaker feeds back into the mic — at the cost of the
 * audio quality RJs have been reporting on mobile.
 */
export type MicMode = "headphones" | "speaker";

export interface VoiceProcessorSettings {
  gateThresholdDb: number;
  eqLowGainDb: number;
  eqMidGainDb: number;
  eqHighGainDb: number;
  gainDb: number;
  compThresholdDb: number;
  compRatio: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceProcessorSettings = {
  gateThresholdDb: -50,
  eqLowGainDb: 0,
  eqMidGainDb: 0,
  eqHighGainDb: 0,
  gainDb: 0,
  compThresholdDb: -24,
  compRatio: 3,
};

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * §14 Mixer voice chain: mic (with browser-native noise suppression/echo
 * cancellation via getUserMedia constraints) -> noise gate (AudioWorklet,
 * gracefully skipped if the module fails to load — a DSP bug must never be
 * able to silence a broadcast) -> 3-band EQ -> makeup gain -> compressor ->
 * limiter (a fast/high-ratio DynamicsCompressorNode emulating a brickwall
 * limiter — the Web Audio API has no true lookahead limiter node) -> the
 * track that actually gets published as the room's microphone source.
 *
 * Distinct from useStudioMixer's bus (music/jingles/SFX, published as a
 * *second* track) — this hook processes the mic itself, replacing the raw
 * getUserMedia track useStudioRoom would otherwise publish directly.
 */
export function useVoiceProcessor() {
  // Headphones is the default: it is what a broadcast should use, and it is
  // the setting that makes music and call-in audio survive on a phone.
  const [micMode, setMicMode] = useState<MicMode>("headphones");
  const ctxRef = useRef<AudioContext | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const gateNodeRef = useRef<AudioWorkletNode | null>(null);
  const lowShelfRef = useRef<BiquadFilterNode | null>(null);
  const midPeakRef = useRef<BiquadFilterNode | null>(null);
  const highShelfRef = useRef<BiquadFilterNode | null>(null);
  const makeupGainRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterDataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  const [settings, setSettings] = useState<VoiceProcessorSettings>(DEFAULT_VOICE_SETTINGS);
  const [gateActive, setGateActive] = useState(true);
  const [peakLevel, setPeakLevel] = useState(0);
  const [isOverloaded, setIsOverloaded] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const buildProcessedMicTrack = useCallback(async (): Promise<MediaStreamTrack> => {
    // Mic constraints matter far more on a phone than on a laptop.
    //
    // With echoCancellation on, a mobile browser puts the device into its
    // voice-call audio mode: the AEC treats everything coming out of the
    // speaker as echo to remove — which on a broadcast means it actively
    // cancels the music bed and the caller's voice. That is precisely the
    // "sound texture is poor / I can't hear the caller" report from RJs
    // broadcasting on mobile. Noise suppression compounds it by gating music
    // it mistakes for background noise.
    //
    // So: with headphones (the correct way to broadcast) both are off and the
    // mic stays wideband and clean. Without headphones they have to stay on or
    // the speaker feeds straight back into the mic.
    const wantsBroadcastQuality = micMode === "headphones";
    const rawStream = await navigator.mediaDevices.getUserMedia({
      audio: wantsBroadcastQuality
        ? {
            noiseSuppression: false,
            echoCancellation: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: 48000,
          }
        : { noiseSuppression: true, echoCancellation: true, autoGainControl: false },
    });
    rawStreamRef.current = rawStream;

    const ctx = new AudioContext({ sampleRate: 48000 });
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(rawStream);

    let gateOutput: AudioNode = source;
    try {
      await ctx.audioWorklet.addModule("/worklets/noise-gate-processor.js");
      const gate = new AudioWorkletNode(ctx, "noise-gate-processor");
      gate.parameters.get("thresholdDb")!.value = settings.gateThresholdDb;
      source.connect(gate);
      gateNodeRef.current = gate;
      gateOutput = gate;
      setGateActive(true);
    } catch (err) {
      console.error("[useVoiceProcessor] noise gate worklet failed to load — passing through ungated:", err);
      gateOutput = source;
      setGateActive(false);
    }

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 200;
    lowShelf.gain.value = settings.eqLowGainDb;

    const midPeak = ctx.createBiquadFilter();
    midPeak.type = "peaking";
    midPeak.frequency.value = 1000;
    midPeak.Q.value = 1;
    midPeak.gain.value = settings.eqMidGainDb;

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 4000;
    highShelf.gain.value = settings.eqHighGainDb;

    const makeupGain = ctx.createGain();
    makeupGain.gain.value = dbToLinear(settings.gainDb);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = settings.compThresholdDb;
    compressor.ratio.value = settings.compRatio;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressor.knee.value = 12;

    // Limiter — always-on safety net downstream of the compressor, not
    // exposed as a control. Fast attack + high ratio + low threshold is the
    // standard way to emulate a brickwall limiter without a true lookahead
    // node (Web Audio has none).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    limiter.knee.value = 0;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    meterDataRef.current = new Uint8Array(analyser.fftSize);

    const destination = ctx.createMediaStreamDestination();

    gateOutput.connect(lowShelf);
    lowShelf.connect(midPeak);
    midPeak.connect(highShelf);
    highShelf.connect(makeupGain);
    makeupGain.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(destination);

    lowShelfRef.current = lowShelf;
    midPeakRef.current = midPeak;
    highShelfRef.current = highShelf;
    makeupGainRef.current = makeupGain;
    compressorRef.current = compressor;
    analyserRef.current = analyser;

    const tick = () => {
      const analyserNode = analyserRef.current;
      const buf = meterDataRef.current;
      if (analyserNode && buf) {
        analyserNode.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        setPeakLevel(peak);
        setIsOverloaded(peak > 0.98);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    setIsActive(true);

    return destination.stream.getAudioTracks()[0];
    // Settings are only used to seed initial node values here — later
    // changes go through the setters below, which adjust the live
    // AudioParams directly rather than rebuilding the graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rampTarget = (node: AudioParam | undefined | null, value: number) => {
    const ctx = ctxRef.current;
    if (!node || !ctx) return;
    node.linearRampToValueAtTime(value, ctx.currentTime + 0.05);
  };

  const setGateThresholdDb = useCallback((db: number) => {
    setSettings((s) => ({ ...s, gateThresholdDb: db }));
    gateNodeRef.current?.parameters.get("thresholdDb")?.setValueAtTime(db, ctxRef.current?.currentTime ?? 0);
  }, []);
  const setEqLowGainDb = useCallback((db: number) => {
    setSettings((s) => ({ ...s, eqLowGainDb: db }));
    rampTarget(lowShelfRef.current?.gain, db);
  }, []);
  const setEqMidGainDb = useCallback((db: number) => {
    setSettings((s) => ({ ...s, eqMidGainDb: db }));
    rampTarget(midPeakRef.current?.gain, db);
  }, []);
  const setEqHighGainDb = useCallback((db: number) => {
    setSettings((s) => ({ ...s, eqHighGainDb: db }));
    rampTarget(highShelfRef.current?.gain, db);
  }, []);
  const setGainDb = useCallback((db: number) => {
    setSettings((s) => ({ ...s, gainDb: db }));
    rampTarget(makeupGainRef.current?.gain, dbToLinear(db));
  }, []);
  const setCompThresholdDb = useCallback((db: number) => {
    setSettings((s) => ({ ...s, compThresholdDb: db }));
    rampTarget(compressorRef.current?.threshold, db);
  }, []);
  const setCompRatio = useCallback((ratio: number) => {
    setSettings((s) => ({ ...s, compRatio: ratio }));
    rampTarget(compressorRef.current?.ratio, ratio);
  }, []);

  const applyDefaults = useCallback((defaults: Partial<VoiceProcessorSettings>) => {
    if (defaults.gateThresholdDb !== undefined) setGateThresholdDb(defaults.gateThresholdDb);
    if (defaults.eqLowGainDb !== undefined) setEqLowGainDb(defaults.eqLowGainDb);
    if (defaults.eqMidGainDb !== undefined) setEqMidGainDb(defaults.eqMidGainDb);
    if (defaults.eqHighGainDb !== undefined) setEqHighGainDb(defaults.eqHighGainDb);
    if (defaults.gainDb !== undefined) setGainDb(defaults.gainDb);
    if (defaults.compThresholdDb !== undefined) setCompThresholdDb(defaults.compThresholdDb);
    if (defaults.compRatio !== undefined) setCompRatio(defaults.compRatio);
  }, [setGateThresholdDb, setEqLowGainDb, setEqMidGainDb, setEqHighGainDb, setGainDb, setCompThresholdDb, setCompRatio]);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    rawStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawStreamRef.current = null;
    ctxRef.current?.close().catch(() => null);
    ctxRef.current = null;
    gateNodeRef.current = null;
    lowShelfRef.current = null;
    midPeakRef.current = null;
    highShelfRef.current = null;
    makeupGainRef.current = null;
    compressorRef.current = null;
    analyserRef.current = null;
    setPeakLevel(0);
    setIsOverloaded(false);
    setIsActive(false);
  }, []);

  return {
    micMode,
    setMicMode,
    settings, gateActive, peakLevel, isOverloaded, isActive,
    buildProcessedMicTrack, teardown, applyDefaults,
    setGateThresholdDb, setEqLowGainDb, setEqMidGainDb, setEqHighGainDb, setGainDb, setCompThresholdDb, setCompRatio,
  };
}
