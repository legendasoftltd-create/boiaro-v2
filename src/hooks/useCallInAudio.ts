import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

// Public STUN only, for now — works for most direct peer connections.
// A self-hosted TURN relay (coturn) is the planned addition for callers
// behind strict NAT/firewalls; add its urls/credentials here once
// provisioned (see LIVE_RADIO_API.md's Call-in Audio section).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type CallInConnectionState = "idle" | "connecting" | "connected" | "failed" | "closed";

/**
 * One WebRTC peer connection between the current user and exactly one other
 * participant (host<->caller) in a live session's call-in. The server never
 * touches audio — it only relays SDP/ICE over the existing live-session
 * socket (see realtime/socket.ts's callin:* handlers). Both roles use this
 * same hook: the host calls `answerIncoming()` when it receives an offer,
 * the caller calls `startCall()` to initiate one.
 */
export function useCallInAudio(getSocket: () => Socket | null, sessionId: string | undefined) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerUserIdRef = useRef<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<CallInConnectionState>("idle");
  const [localMuted, setLocalMuted] = useState(false);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peerUserIdRef.current = null;
    setRemoteStream(null);
    setState("closed");
  }, []);

  const ensurePeerConnection = useCallback((targetUserId: string) => {
    if (pcRef.current) return pcRef.current;
    peerUserIdRef.current = targetUserId;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate && sessionId) {
        getSocket()?.emit("callin:ice-candidate", { sessionId, targetUserId, payload: e.candidate });
      }
    };
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      setState(s === "connected" ? "connected" : s === "failed" ? "failed" : s === "closed" ? "closed" : "connecting");
    };
    pcRef.current = pc;
    return pc;
  }, [getSocket, sessionId]);

  /** Caller side: get the mic, create + send an offer to the host. */
  const startCall = useCallback(async (hostUserId: string) => {
    if (!sessionId) return;
    setState("connecting");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    const pc = ensurePeerConnection(hostUserId);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    getSocket()?.emit("callin:offer", { sessionId, targetUserId: hostUserId, payload: offer });
  }, [sessionId, ensurePeerConnection, getSocket]);

  const hangup = useCallback(() => {
    if (sessionId && peerUserIdRef.current) {
      getSocket()?.emit("callin:hangup", { sessionId, targetUserId: peerUserIdRef.current });
    }
    cleanup();
  }, [sessionId, getSocket, cleanup]);

  const toggleLocalMute = useCallback((muted: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    setLocalMuted(muted);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !sessionId) return;

    const onOffer = async ({ fromUserId, payload }: { fromUserId: string; payload: RTCSessionDescriptionInit }) => {
      setState("connecting");
      const pc = ensurePeerConnection(fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("callin:answer", { sessionId, targetUserId: fromUserId, payload: answer });
    };
    const onAnswer = async ({ payload }: { payload: RTCSessionDescriptionInit }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(payload));
    };
    const onIce = async ({ payload }: { payload: RTCIceCandidateInit }) => {
      try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(payload)); } catch { /* ignore stray candidates after close */ }
    };
    const onHangup = () => cleanup();
    const onMute = () => toggleLocalMute(true);

    socket.on("callin:offer", onOffer);
    socket.on("callin:answer", onAnswer);
    socket.on("callin:ice-candidate", onIce);
    socket.on("callin:hangup", onHangup);
    socket.on("callin:mute", onMute);

    return () => {
      socket.off("callin:offer", onOffer);
      socket.off("callin:answer", onAnswer);
      socket.off("callin:ice-candidate", onIce);
      socket.off("callin:hangup", onHangup);
      socket.off("callin:mute", onMute);
    };
  }, [getSocket, sessionId, ensurePeerConnection, cleanup, toggleLocalMute]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { remoteStream, state, localMuted, startCall, hangup, toggleLocalMute };
}
