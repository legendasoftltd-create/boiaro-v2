import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export function useGamification() {
  const { user } = useAuth();
  const updateStreak = trpc.gamification.updateStreak.useMutation();
  const addPoints = trpc.gamification.addPoints.useMutation();

  const recordActivity = useCallback(
    async (eventType: string, points: number = 5, referenceId?: string) => {
      if (!user) return;
      try {
        await updateStreak.mutateAsync({});
        if (points > 0) {
          await addPoints.mutateAsync({
            points,
            eventType,
            referenceId,
          });
        }
      } catch {
        // Silent fail
      }
    },
    [user, updateStreak, addPoints]
  );

  const checkAndAwardBadge = useCallback(
    async (_conditionType: string, _currentValue: number) => {
      // Badge checking is handled server-side on relevant events
    },
    []
  );

  return { recordActivity, checkAndAwardBadge };
}
