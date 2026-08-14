import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { toast } from "sonner";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  message: string;
  created_at: string;
}

export interface FloatingReaction {
  key: string;
  emoji: string;
  user_id: string;
}

export interface SongRequestItem {
  id: string;
  user_id: string;
  display_name: string | null;
  request_text: string;
  status: "pending" | "played" | "rejected";
  created_at: string;
}

/**
 * Connects once per live session, joins its socket room, and exposes the
 * interactive layer (chat, reactions, song requests, listener count) plus
 * host-only moderation actions (harmless to call as a non-host — the server
 * rejects them). Chat history before joining comes from a separate REST
 * call (GET /live/:sessionId/chat) — the socket only carries what happens
 * after you connect.
 *
 * Signed-out visitors can connect too (as long as radio_guest_listening_enabled
 * is on) so they're counted in the listener badge and persisted analytics —
 * the server rejects their chat/reaction/request/moderation attempts with a
 * friendly "sign in to..." error instead of silently dropping them.
 */
export function useLiveSocket(sessionId: string | undefined) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [songRequests, setSongRequests] = useState<SongRequestItem[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    const token = localStorage.getItem("access_token");

    const socket = io(API_BASE || window.location.origin, {
      path: "/socket.io",
      auth: token ? { token } : {},
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", async () => {
      setConnected(true);
      // Was always defaulting to "web" server-side — nothing here ever sent
      // a real value, even from the Android/iOS app shell. deviceId is only
      // used server-side when there's no token (guest) — see socket.ts.
      const deviceId = await getOrCreateDeviceId();
      socket.emit("join_session", { sessionId, platform: Capacitor.getPlatform(), deviceId });
    });
    socket.on("disconnect", () => setConnected(false));
    // A rejected connection (e.g. guest listening disabled) shouldn't keep
    // retrying forever — audio playback itself never depended on this socket.
    socket.on("connect_error", () => socket.disconnect());

    socket.on("listener_count", (data: { sessionId: string; count: number }) => {
      if (data.sessionId === sessionId) setListenerCount(data.count);
    });
    socket.on("chat:new", (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-200)));
    socket.on("chat:deleted", ({ messageId }: { messageId: string }) =>
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    );
    socket.on("reaction:new", (r: { emoji: string; user_id: string }) => {
      const key = `${Date.now()}-${Math.random()}`;
      setReactions((prev) => [...prev, { ...r, key }]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.key !== key)), 3000);
    });
    socket.on("song_request:new", (req: SongRequestItem) => setSongRequests((prev) => [req, ...prev]));
    socket.on("song_request:updated", ({ id, status }: { id: string; status: SongRequestItem["status"] }) =>
      setSongRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    );
    // Muted/banned users get rejected here silently otherwise — the server
    // reuses this generic event for every socket-level rejection.
    socket.on("error", (data: { message?: string }) => {
      if (data?.message) toast.error(data.message);
    });

    return () => {
      socket.emit("leave_session");
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setMessages([]);
      setSongRequests([]);
    };
  }, [sessionId, user]);

  const sendMessage = useCallback((message: string) => {
    if (!sessionId) return;
    socketRef.current?.emit("chat:send", { sessionId, message });
  }, [sessionId]);

  const sendReaction = useCallback((emoji: string) => {
    if (!sessionId) return;
    socketRef.current?.emit("reaction:send", { sessionId, emoji });
  }, [sessionId]);

  const sendSongRequest = useCallback((requestText: string) => {
    if (!sessionId) return;
    socketRef.current?.emit("song_request:send", { sessionId, requestText });
  }, [sessionId]);

  const deleteMessage = useCallback((messageId: string) => {
    if (!sessionId) return;
    socketRef.current?.emit("moderation:delete_message", { sessionId, messageId });
  }, [sessionId]);

  const updateSongRequestStatus = useCallback((requestId: string, status: "played" | "rejected") => {
    if (!sessionId) return;
    socketRef.current?.emit("song_request:update_status", { sessionId, requestId, status });
  }, [sessionId]);

  // Lazily read the current socket — used by useCallInAudio, which attaches
  // its own listeners to this same connection rather than opening a second
  // one just for call-in signaling.
  const getSocket = useCallback(() => socketRef.current, []);

  return {
    connected, listenerCount, messages, reactions, songRequests,
    sendMessage, sendReaction, sendSongRequest, deleteMessage, updateSongRequestStatus,
    setMessages, setSongRequests, getSocket,
  };
}
