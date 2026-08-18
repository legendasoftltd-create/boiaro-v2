import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

const HEARTBEAT_INTERVAL_MS = 20_000;

export interface LiveSession {
  id: string;
  rj_user_id: string;
  station_id: string | null;
  stream_url: string | null;
  show_title: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  disconnect_reason: string | null;
  is_test?: boolean;
  category?: string | null;
  chat_enabled?: boolean;
  requests_enabled?: boolean;
  recording_enabled?: boolean;
  callin_enabled?: boolean;
  // Present only for a BoiAro Studio (LiveKit) broadcast — null for the
  // external-encoder "Simple Go-Live" flow. Distinguishes them because
  // call-in only actually reaches listeners for a Studio broadcast (via
  // the LiveKit bridge in StudioRoom.tsx) — managing calls from this page
  // for a Studio broadcast is a private RJ<->caller preview that never
  // reaches the audience, so the UI needs to know which one it's dealing with.
  studio_session?: { id: string } | null;
}

export interface RjProfile {
  id: string;
  user_id?: string;
  stage_name: string;
  bio: string | null;
  avatar_url: string | null;
  specialty: string | null;
  is_approved: boolean;
  is_active: boolean;
}

export function useRjProfile() {
  const { user } = useAuth();
  const query = trpc.rj.myProfile.useQuery(undefined, { enabled: !!user });
  return { profile: query.data as RjProfile | null | undefined, loading: query.isLoading };
}

export function useCurrentLiveSession(options?: { enabled?: boolean }) {
  const query = trpc.rj.liveSession.current.useQuery(undefined, {
    refetchInterval: 15_000,
    enabled: options?.enabled ?? true,
  });

  return {
    session: query.data as (LiveSession & { rj_profile?: RjProfile }) | null | undefined,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}

// Every station that's live right now, not just the single most-recently-
// started one — several stations can be live concurrently (see
// studio-bridge's per-station Icecast mounts).
export function useAllLiveSessions() {
  const query = trpc.rj.liveSession.allCurrent.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  return {
    sessions: (query.data ?? []) as (LiveSession & { rj_profile?: RjProfile | null })[],
    loading: query.isLoading,
  };
}

// A specific session by id, live or already ended — for deep links
// (go-live notifications, shared /live/:sessionId URLs) that must keep
// pointing at the broadcast they were sent for.
export function useLiveSessionById(sessionId: string | undefined) {
  const query = trpc.rj.liveSession.byId.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId, refetchInterval: 15_000 }
  );

  return {
    session: query.data as (LiveSession & { rj_profile?: RjProfile | null }) | null | undefined,
    loading: query.isLoading,
  };
}

// The broadcast credential required to go live — a secret distinct from the
// RJ's login session. The plaintext token is only ever available in the
// return value of `regenerate()`, right after generating it.
export function useBroadcastToken() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.rj.broadcastTokenStatus.useQuery();
  const regenerateMutation = trpc.rj.regenerateBroadcastToken.useMutation({
    onSuccess: () => utils.rj.broadcastTokenStatus.invalidate(),
  });
  const revokeMutation = trpc.rj.revokeBroadcastToken.useMutation({
    onSuccess: () => utils.rj.broadcastTokenStatus.invalidate(),
  });

  return {
    status: statusQuery.data,
    loading: statusQuery.isLoading,
    regenerate: () => regenerateMutation.mutateAsync(),
    revoke: () => revokeMutation.mutateAsync(),
    isRegenerating: regenerateMutation.isPending,
  };
}

// Broadcaster terms/copyright acceptance — must be accepted (current
// platform version) before the RJ can start a live session.
export function useRjTerms() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.rj.termsStatus.useQuery();
  const acceptMutation = trpc.rj.acceptTerms.useMutation({
    onSuccess: () => utils.rj.termsStatus.invalidate(),
  });

  return {
    status: statusQuery.data,
    loading: statusQuery.isLoading,
    accept: (clauses: string[]) => acceptMutation.mutateAsync({ clauses: clauses as any }),
    isAccepting: acceptMutation.isPending,
  };
}

export interface GoLiveOptions {
  streamUrl: string;
  showTitle?: string;
  description?: string;
  coverImageUrl?: string;
  stationId?: string;
  category?: string;
  broadcastToken: string;
  isTest?: boolean;
  chatEnabled?: boolean;
  requestsEnabled?: boolean;
  recordingEnabled?: boolean;
  callinEnabled?: boolean;
}

export function useMyLiveSession() {
  const utils = trpc.useUtils();

  // The RJ's own session — correct even when a different host is live at
  // the same time (unlike the old approach of reusing the single
  // platform-wide "current" query and checking whose id it was).
  const myActiveQuery = trpc.rj.liveSession.myActiveSession.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const startMutation = trpc.rj.liveSession.start.useMutation({
    onSuccess: () => utils.rj.liveSession.myActiveSession.invalidate(),
  });

  const endMutation = trpc.rj.liveSession.end.useMutation({
    onSuccess: () => utils.rj.liveSession.myActiveSession.invalidate(),
  });

  const heartbeatMutation = trpc.rj.liveSession.heartbeat.useMutation();

  const mySession = myActiveQuery.data as LiveSession | null | undefined;

  // Keep the session alive server-side — a missed heartbeat past the grace
  // period flips the session to "reconnecting" and, if it stays missed,
  // auto-ends it (jobs/streamReconnect.ts). This is what tells the backend
  // "the broadcast is still actually running" independent of the stream URL.
  useEffect(() => {
    if (!mySession || mySession.status === "ended") return;
    const id = mySession.id;
    const timer = setInterval(() => {
      heartbeatMutation.mutate({ sessionId: id });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySession?.id, mySession?.status]);

  // Closing or navigating away from this tab silently stops the heartbeat
  // above with no warning — the RJ has no way to know listeners are about
  // to go quiet until the grace period expires. Browsers ignore any custom
  // message and show their own generic wording, but triggering the native
  // confirmation at all is the part that matters.
  useEffect(() => {
    if (!mySession || mySession.status === "ended") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [mySession?.id, mySession?.status]);

  const goLive = async (opts: GoLiveOptions) => {
    return startMutation.mutateAsync({
      streamUrl: opts.streamUrl,
      showTitle: opts.showTitle,
      description: opts.description,
      coverImageUrl: opts.coverImageUrl,
      stationId: opts.stationId,
      category: opts.category,
      broadcastToken: opts.broadcastToken,
      isTest: opts.isTest ?? false,
      chatEnabled: opts.chatEnabled ?? true,
      requestsEnabled: opts.requestsEnabled ?? true,
      recordingEnabled: opts.recordingEnabled ?? true,
      callinEnabled: opts.callinEnabled ?? false,
    });
  };

  const endLive = async () => {
    if (!mySession) return;
    await endMutation.mutateAsync({ sessionId: mySession.id });
  };

  return {
    session: mySession,
    loading: myActiveQuery.isLoading,
    goLive,
    endLive,
  };
}
