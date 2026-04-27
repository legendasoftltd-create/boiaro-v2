import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useDailyReward() {
  const { user } = useAuth();
  const [claiming, setClaiming] = useState(false);

  const claimDailyMutation = trpc.gamification.claimDailyReward.useMutation();
  const claimAdMutation = trpc.gamification.claimAdReward.useMutation();

  const claimDailyReward = useCallback(async (): Promise<boolean> => {
    if (!user || claiming) return false;
    setClaiming(true);
    try {
      const result = await claimDailyMutation.mutateAsync({}) as any;
      if (result?.success) {
        toast.success(`🎉 দৈনিক লগইন পুরস্কার: +${result.reward} কয়েন!`);
        return true;
      }
      if (result?.reason === "already_claimed") {
        toast.info("আজকের পুরস্কার ইতোমধ্যে নেওয়া হয়েছে");
      } else if (result?.reason === "daily_limit_reached") {
        toast.info("আজকের দৈনিক সীমা পূর্ণ হয়েছে");
      }
      return false;
    } catch {
      toast.error("দৈনিক পুরস্কার নেওয়া ব্যর্থ");
      return false;
    } finally {
      setClaiming(false);
    }
  }, [user, claiming, claimDailyMutation]);

  const claimAdReward = useCallback(async (placement: string = "general"): Promise<boolean> => {
    if (!user) return false;
    try {
      const result = await claimAdMutation.mutateAsync({ placement }) as any;
      if (result?.success) {
        toast.success(`🎬 অ্যাড দেখার পুরস্কার: +${result.reward} কয়েন!`);
        return true;
      }
      if (result?.reason === "daily_limit_reached") {
        toast.info("আজকের দৈনিক সীমা পূর্ণ");
      }
      return false;
    } catch {
      return false;
    }
  }, [user, claimAdMutation]);

  return { claimDailyReward, claimAdReward, claiming };
}
