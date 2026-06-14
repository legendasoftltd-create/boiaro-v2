import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STORAGE_KEY = "daily_reward_claimed_date";

export function DailyLoginReward() {
  const { user } = useAuth();
  const claimMutation = trpc.gamification.claimDailyReward.useMutation();
  const didRun = useRef(false);

  useEffect(() => {
    if (!user || didRun.current) return;
    didRun.current = true;

    const today = new Date().toISOString().slice(0, 10);
    const lastClaimed = localStorage.getItem(STORAGE_KEY);
    if (lastClaimed === today) return;

    claimMutation.mutateAsync({}).then((result: any) => {
      if (result?.success) {
        localStorage.setItem(STORAGE_KEY, today);
        toast.success(`দৈনিক লগইন পুরস্কার: +${result.reward} কয়েন!`, {
          description: "প্রতিদিন লগইন করে কয়েন অর্জন করুন।",
        });
      } else if (result?.reason === "already_claimed") {
        localStorage.setItem(STORAGE_KEY, today);
      }
    }).catch(() => {});
  }, [user]);

  return null;
}
