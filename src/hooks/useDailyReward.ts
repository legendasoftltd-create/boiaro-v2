import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useDailyReward() {
  const { user } = useAuth();
  const [claiming, setClaiming] = useState(false);

  const claimDailyReward = useCallback(async (): Promise<boolean> => {
    if (!user || claiming) return false;
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("claim_daily_login_reward");
      if (error) { toast.error("দৈনিক পুরস্কার নেওয়া ব্যর্থ"); return false; }
      const result = data as any;
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
    } finally {
      setClaiming(false);
    }
  }, [user, claiming]);

  const claimAdReward = useCallback(async (placement: string = "general"): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.rpc("claim_ad_reward", { p_ad_placement: placement });
      if (error) { toast.error("কয়েন পুরস্কার ব্যর্থ"); return false; }
      const result = data as any;
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
  }, [user]);

  return { claimDailyReward, claimAdReward, claiming };
}
