import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

export type StudioConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

export interface StudioParticipantInfo {
  identity: string;
  isSpeaking: boolean;
  isMicOn: boolean;
}

/**
 * Wraps a single livekit-client Room for the Studio (audio-only, multi-party
 * — unlike useCallInAudio's 1:1 RTCPeerConnection for the call-in feature).
 * Remote audio tracks are attached to hidden <audio> elements managed here;
 * UI components only ever see plain participant state.
 */
export function useStudioRoom() {
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const [state, setState] = useState<StudioConnectionState>("idle");
  const [participants, setParticipants] = useState<StudioParticipantInfo[]>([]);
  const [micOn, setMicOn] = useState(false);

  const syncParticipants = useCallback((room: Room) => {
    const speaking = new Set(room.activeSpeakers.map((p) => p.identity));
    const list: StudioParticipantInfo[] = [];
    // room.remoteParticipants excludes the local participant by design (it's
    // a separate room.localParticipant) — without adding it here too, the
    // host never sees their own speaking indicator light up, with nothing
    // else in the UI confirming their mic is actually being captured.
    const local = room.localParticipant;
    if (local) {
      list.push({ identity: local.identity, isSpeaking: speaking.has(local.identity), isMicOn: local.isMicrophoneEnabled });
    }
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      list.push({ identity: p.identity, isSpeaking: speaking.has(p.identity), isMicOn: p.isMicrophoneEnabled });
    });
    setParticipants(list);
  }, []);

  const connect = useCallback(async (url: string, token: string, publishMic: boolean) => {
    if (roomRef.current) return;
    setState("connecting");
    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.Connected, () => {
      setState("connected");
      syncParticipants(room);
    });
    room.on(RoomEvent.Disconnected, () => setState("disconnected"));
    room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
    room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
    room.on(RoomEvent.ActiveSpeakersChanged, () => syncParticipants(room));
    room.on(RoomEvent.TrackMuted, () => syncParticipants(room));
    room.on(RoomEvent.TrackUnmuted, () => syncParticipants(room));

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.autoplay = true;
      audioElsRef.current.set(participant.identity, el);
      document.body.appendChild(el);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => el.remove());
      audioElsRef.current.delete(participant.identity);
    });

    try {
      await room.connect(url, token);
      if (publishMic) {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);
      }
      syncParticipants(room);
    } catch (err) {
      setState("failed");
      throw err;
    }
  }, [syncParticipants]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
    syncParticipants(room);
  }, [micOn, syncParticipants]);

  const disconnect = useCallback(() => {
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current.clear();
    roomRef.current?.disconnect();
    roomRef.current = null;
    setState("disconnected");
    setParticipants([]);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  // Lazily read the current Room instance — used by useStudioMixer, which
  // publishes a second (music/jingle/SFX) track into this same room rather
  // than opening a separate connection. Same lazy-accessor pattern as
  // useLiveSocket's getSocket(), used by useCallInAudio.
  const getRoom = useCallback(() => roomRef.current, []);

  return { state, participants, micOn, connect, toggleMic, disconnect, getRoom };
}
