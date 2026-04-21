import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export interface LiveSession {
  id: string;
  rj_user_id: string;
  station_id: string | null;
  stream_url: string | null;
  show_title: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  disconnect_reason: string | null;
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
  // RJ profile lookups are not yet a dedicated tRPC endpoint; return empty.
  return { profile: null, loading: false };
}

export function useCurrentLiveSession() {
  const query = trpc.rj.liveSession.current.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  return {
    session: query.data as (LiveSession & { rj_profile?: RjProfile }) | null | undefined,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useMyLiveSession() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const currentQuery = trpc.rj.liveSession.current.useQuery(undefined, {
    refetchInterval: 10_000,
    enabled: !!user,
  });

  const startMutation = trpc.rj.liveSession.start.useMutation({
    onSuccess: () => utils.rj.liveSession.current.invalidate(),
  });

  const endMutation = trpc.rj.liveSession.end.useMutation({
    onSuccess: () => utils.rj.liveSession.current.invalidate(),
  });

  const currentSession = currentQuery.data as LiveSession | null | undefined;
  const mySession = currentSession?.rj_user_id === user?.id ? currentSession : null;

  const goLive = async (stationId: string) => {
    const result = await startMutation.mutateAsync({ stationId });
    return result;
  };

  const endLive = async (reason?: string) => {
    if (!mySession) return;
    await endMutation.mutateAsync({ sessionId: mySession.id });
  };

  return {
    session: mySession,
    loading: currentQuery.isLoading,
    goLive,
    endLive,
  };
}
