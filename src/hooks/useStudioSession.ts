import { trpc } from "@/lib/trpc";

export interface StudioSession {
  id: string;
  room_name: string;
  show_schedule_id: string | null;
  host_user_id: string;
  status: "scheduled" | "live" | "ended";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  media_type: string;
  live_session_id: string | null;
}

export interface StudioParticipant {
  id: string;
  studio_session_id: string;
  user_id: string;
  role: "host" | "co_host" | "producer" | "rj" | "guest";
  joined_at: string;
  left_at: string | null;
}

export function useMyStudioSessions() {
  const query = trpc.studio.mySessions.useQuery();
  return { sessions: (query.data as StudioSession[] | undefined) ?? [], loading: query.isLoading, refetch: query.refetch };
}

export function useCreateStudioSession() {
  const utils = trpc.useUtils();
  const mutation = trpc.studio.createSession.useMutation({
    onSuccess: () => utils.studio.mySessions.invalidate(),
  });
  return { createSession: (showScheduleId?: string) => mutation.mutateAsync({ showScheduleId }), isCreating: mutation.isPending };
}

export function useStudioParticipants(sessionId: string | undefined) {
  const query = trpc.studio.participants.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId, refetchInterval: 5_000 }
  );
  return { participants: (query.data as StudioParticipant[] | undefined) ?? [], loading: query.isLoading, refetch: query.refetch };
}

export function useGenerateInviteLink(sessionId: string) {
  const mutation = trpc.studio.generateInviteLink.useMutation();
  return {
    generate: (role: "co_host" | "producer" | "rj" | "guest", expiresInMinutes?: number) =>
      mutation.mutateAsync({ sessionId, role, expiresInMinutes }),
    isGenerating: mutation.isPending,
  };
}

export function useJoinToken() {
  const mutation = trpc.studio.joinToken.useMutation();
  return { getToken: (sessionId: string) => mutation.mutateAsync({ sessionId }) };
}

export function useStudioModeration(sessionId: string) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.studio.participants.invalidate({ sessionId });

  const promoteMutation = trpc.studio.promoteToPublish.useMutation({ onSuccess: invalidate });
  const removeMutation = trpc.studio.removeParticipant.useMutation({ onSuccess: invalidate });

  return {
    promoteToPublish: (participantUserId: string) => promoteMutation.mutateAsync({ sessionId, participantUserId }),
    removeParticipant: (participantUserId: string) => removeMutation.mutateAsync({ sessionId, participantUserId }),
  };
}

export function useBroadcastControl(sessionId: string) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.studio.mySessions.invalidate();

  const startMutation = trpc.studio.startBroadcast.useMutation({ onSuccess: invalidate });
  const endMutation = trpc.studio.endBroadcast.useMutation({ onSuccess: invalidate });

  return {
    startBroadcast: (opts?: { stationId?: string; showTitle?: string }) =>
      startMutation.mutateAsync({ sessionId, ...opts }),
    endBroadcast: () => endMutation.mutateAsync({ sessionId }),
    isStarting: startMutation.isPending,
    isEnding: endMutation.isPending,
  };
}
