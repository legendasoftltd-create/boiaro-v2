import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

interface UseFollowOptions {
  profileId: string;
  profileType: "author" | "narrator" | "publisher";
}

export function useFollow({ profileId }: UseFollowOptions) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const countQuery = trpc.follows.countFor.useQuery({ profileId }, { enabled: !!profileId });
  const isFollowingQuery = trpc.follows.isFollowing.useQuery(
    { profileId },
    { enabled: !!user && !!profileId }
  );

  const toggleMutation = trpc.follows.toggle.useMutation({
    onSuccess: () => {
      utils.follows.countFor.invalidate({ profileId });
      utils.follows.isFollowing.invalidate({ profileId });
    },
  });

  const toggle = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      await toggleMutation.mutateAsync({ profileId });
      return true;
    } catch {
      return false;
    }
  };

  return {
    isFollowing: isFollowingQuery.data?.following ?? false,
    followersCount: countQuery.data ?? 0,
    loading: countQuery.isLoading || isFollowingQuery.isLoading,
    toggling: toggleMutation.isPending,
    toggle,
  };
}
