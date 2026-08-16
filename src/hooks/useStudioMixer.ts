import { useCallback, useEffect, useRef, useState } from "react";
import { Track, type Room } from "livekit-client";

export interface MixerAsset {
  id: string;
  title: string;
  file_url: string;
  category: "music" | "jingle" | "sfx";
}

const DEFAULT_DUCK_LEVEL = 0.25;
const DEFAULT_DUCK_ATTACK_S = 0.2;
const DEFAULT_DUCK_RELEASE_S = 1;

/**
 * §14 Mixer: a Web Audio graph (music player + one-shot soundboard) mixed
 * onto a shared bus, auto-ducked while the host is speaking, published as a
 * *second* LiveKit track alongside (never replacing) the plain mic track
 * from useStudioRoom. Keeping music/jingles on their own track — rather
 * than mixing them into the mic track before publish — is what makes a
 * voice-only master recording possible later (see studio-bridge's dual-tap):
 * Egress can composite either the whole room (mic + this track, what
 * listeners hear) or just the mic track by id.
 *
 * `isSpeaking` is passed in rather than wired up here directly — the caller
 * already tracks this via useStudioRoom's participant list (driven by
 * RoomEvent.ActiveSpeakersChanged), no need for a second subscription.
 */
export function useStudioMixer(getRoom: () => Room | null, isSpeaking: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const duckGainRef = useRef<GainNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loopEnabledRef = useRef(false);
  const publishedTrackRef = useRef<MediaStreamTrack | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  const [isPublished, setIsPublished] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<MixerAsset | null>(null);
  const [musicVolume, setMusicVolumeState] = useState(0.7);
  const [duckingEnabled, setDuckingEnabled] = useState(true);
  const [isDucked, setIsDucked] = useState(false);
  const [loopEnabled, setLoopEnabledState] = useState(false);
  // Admin-set platform defaults (see studio.mixerDefaults) seed these once
  // via applyDuckDefaults — the RJ can freely adjust per-broadcast after.
  const [duckLevel, setDuckLevel] = useState(DEFAULT_DUCK_LEVEL);
  const [duckAttackS, setDuckAttackS] = useState(DEFAULT_DUCK_ATTACK_S);
  const [duckReleaseS, setDuckReleaseS] = useState(DEFAULT_DUCK_RELEASE_S);
  const applyDuckDefaults = useCallback((defaults: { duckLevel: number; duckAttackMs: number; duckReleaseMs: number }) => {
    setDuckLevel(defaults.duckLevel);
    setDuckAttackS(defaults.duckAttackMs / 1000);
    setDuckReleaseS(defaults.duckReleaseMs / 1000);
  }, []);

  const ensureContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    // Pinned to 48000 (WebRTC's standard rate) rather than whatever the
    // local audio device's native rate happens to be (commonly 44100, or
    // lower on some Bluetooth/USB devices) — a MediaStreamAudioDestinationNode
    // track published at a non-48kHz context rate isn't reliably resampled
    // by the browser's WebRTC pipeline the way a plain getUserMedia mic
    // track is, and the receiving end decodes it at the wrong rate, which
    // sounds like slow/low-pitched playback.
    const ctx = new AudioContext({ sampleRate: 48000 });
    const musicGain = ctx.createGain();
    const duckGain = ctx.createGain();
    const destination = ctx.createMediaStreamDestination();
    musicGain.gain.value = musicVolume;
    duckGain.gain.value = 1;
    musicGain.connect(duckGain);
    duckGain.connect(destination);
    audioCtxRef.current = ctx;
    musicGainRef.current = musicGain;
    duckGainRef.current = duckGain;
    destinationRef.current = destination;
    return ctx;
    // musicVolume intentionally only seeds the initial gain — later changes
    // go through setMusicVolume's own ramp, not a graph rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ducking: ramp the shared bus down while the host is speaking, back up
  // ~1s after — applies to both the music player and any one-shot playing
  // at the time, since both feed into duckGain before the destination.
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const duckGain = duckGainRef.current;
    if (!ctx || !duckGain) return;
    const target = duckingEnabled && isSpeaking ? duckLevel : 1;
    duckGain.gain.cancelScheduledValues(ctx.currentTime);
    duckGain.gain.linearRampToValueAtTime(target, ctx.currentTime + (target < 1 ? duckAttackS : duckReleaseS));
    setIsDucked(target < 1);
  }, [isSpeaking, duckingEnabled, duckLevel, duckAttackS, duckReleaseS]);

  const ensurePublished = useCallback(async () => {
    const room = getRoom();
    if (!room) return;
    const ctx = ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (publishedTrackRef.current) return;
    const track = destinationRef.current!.stream.getAudioTracks()[0];
    await room.localParticipant.publishTrack(track, { name: "studio-mixer", source: Track.Source.Unknown });
    publishedTrackRef.current = track;
    setIsPublished(true);
  }, [getRoom, ensureContext]);

  const loadBuffer = useCallback(async (url: string) => {
    const cached = bufferCacheRef.current.get(url);
    if (cached) return cached;
    const ctx = ensureContext();
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCacheRef.current.set(url, buffer);
    return buffer;
  }, [ensureContext]);

  const stopMusic = useCallback(() => {
    try { musicSourceRef.current?.stop(); } catch { /* already stopped */ }
    musicSourceRef.current = null;
    setNowPlaying(null);
  }, []);

  const playTrack = useCallback(async (asset: MixerAsset) => {
    await ensurePublished();
    const buffer = await loadBuffer(asset.file_url);
    stopMusic();
    const ctx = audioCtxRef.current!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loopEnabledRef.current;
    source.connect(musicGainRef.current!);
    // Never fires while source.loop is true — a looping track only "ends"
    // via an explicit stopMusic()/playTrack() call, which already clears
    // musicSourceRef and nowPlaying itself.
    source.onended = () => {
      if (musicSourceRef.current === source) {
        musicSourceRef.current = null;
        setNowPlaying(null);
      }
    };
    source.start();
    musicSourceRef.current = source;
    setNowPlaying(asset);
  }, [ensurePublished, loadBuffer, stopMusic]);

  const setLoopEnabled = useCallback((v: boolean) => {
    setLoopEnabledState(v);
    loopEnabledRef.current = v;
    if (musicSourceRef.current) musicSourceRef.current.loop = v;
  }, []);

  const triggerOneShot = useCallback(async (asset: MixerAsset) => {
    await ensurePublished();
    const buffer = await loadBuffer(asset.file_url);
    const ctx = audioCtxRef.current!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // One-shots skip the music volume slider (musicGain) but still feed
    // into duckGain directly, so they're audible at full volume and still
    // ducked the same as the music bed while the host is speaking.
    source.connect(duckGainRef.current!);
    source.start();
  }, [ensurePublished, loadBuffer]);

  const setMusicVolume = useCallback((v: number) => {
    setMusicVolumeState(v);
    const ctx = audioCtxRef.current;
    if (ctx && musicGainRef.current) {
      musicGainRef.current.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.1);
    }
  }, []);

  const teardown = useCallback(() => {
    stopMusic();
    const room = getRoom();
    if (room && publishedTrackRef.current) {
      room.localParticipant.unpublishTrack(publishedTrackRef.current).catch(() => null);
      publishedTrackRef.current = null;
      setIsPublished(false);
    }
    audioCtxRef.current?.close().catch(() => null);
    audioCtxRef.current = null;
    musicGainRef.current = null;
    duckGainRef.current = null;
    destinationRef.current = null;
  }, [getRoom, stopMusic]);

  useEffect(() => () => teardown(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isPublished, nowPlaying, musicVolume, duckingEnabled, isDucked, loopEnabled,
    duckLevel, duckAttackS, duckReleaseS,
    playTrack, stopMusic, triggerOneShot, setMusicVolume, setDuckingEnabled, setLoopEnabled, teardown,
    setDuckLevel, setDuckAttackS, setDuckReleaseS, applyDuckDefaults,
  };
}
