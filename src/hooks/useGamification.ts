import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useGamification() {
  const { user } = useAuth();

  const recordActivity = useCallback(async (eventType: string, points: number = 5, referenceId?: string) => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];

    // Upsert streak
    const { data: existing } = await supabase
      .from("user_streaks")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const lastDate = existing.last_activity_date;
      if (lastDate === today) {
        // Already recorded today, just add points
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];
        const newStreak = lastDate === yesterdayStr ? (existing.current_streak || 0) + 1 : 1;
        const bestStreak = Math.max(newStreak, existing.best_streak || 0);
        await supabase.from("user_streaks").update({
          current_streak: newStreak,
          best_streak: bestStreak,
          last_activity_date: today,
          streak_updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
      }
    } else {
      await supabase.from("user_streaks").insert({
        user_id: user.id,
        current_streak: 1,
        best_streak: 1,
        last_activity_date: today,
      });
    }

    // Add points
    if (points > 0) {
      await supabase.from("gamification_points").insert({
        user_id: user.id,
        points,
        event_type: eventType,
        reference_id: referenceId || null,
      });
    }
  }, [user]);

  const checkAndAwardBadge = useCallback(async (conditionType: string, currentValue: number) => {
    if (!user) return;
    const { data: badges } = await supabase
      .from("badge_definitions")
      .select("id, condition_value, coin_reward")
      .eq("condition_type", conditionType)
      .eq("is_active", true);

    if (!badges) return;

    for (const badge of badges) {
      if (currentValue >= (badge.condition_value || 0)) {
        const { error } = await supabase.from("user_badges").insert({ user_id: user.id, badge_id: badge.id });
        if (!error && badge.coin_reward && badge.coin_reward > 0) {
          // Award coins via secure RPC
          await supabase.rpc("adjust_user_coins", {
            p_user_id: user.id,
            p_amount: badge.coin_reward,
            p_type: "earn",
            p_description: `Badge reward`,
          });
        }
      }
    }
  }, [user]);

  return { recordActivity, checkAndAwardBadge };
}
