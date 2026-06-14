import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tv, Flame, Gift } from "lucide-react";
import { toast } from "sonner";
import { RewardedAdOverlay } from "./RewardedAdOverlay";

interface Props {
  onRewardEarned?: (newBalance: number) => void;
  placement?: string;
  variant?: "default" | "compact";
  className?: string;
}

const STREAK_THRESHOLD = 5;
const STREAK_BONUS = 2;

export function WatchAdButton({ onRewardEarned, placement = "general", variant = "default", className }: Props) {
  const { user } = useAuth();
  const [adOpen, setAdOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const { data: adStatus, refetch: refetchStatus } = trpc.gamification.adRewardStatus.useQuery(undefined, {
    enabled: !!user,
  });
  const todayCount = adStatus?.todayCount ?? 0;
  const dailyLimit = adStatus?.dailyLimit ?? 10;
  const coinPerAd = adStatus?.coinPerAd ?? 1;
  const cooldownLeft = adStatus?.cooldownSecondsLeft ?? 0;

  const claimAdRewardMutation = trpc.gamification.claimAdReward.useMutation();
  const adjustCoinsMutation = trpc.wallet.adjustCoins.useMutation();

  const handleAdCompleted = useCallback(async () => {
    setAdOpen(false);
    setClaiming(true);
    try {
      const result = await claimAdRewardMutation.mutateAsync({ placement });
      if (!result.success) {
        if (result.reason === "daily_limit_reached") toast.error(`আজকের সীমা (${dailyLimit} অ্যাড) পূর্ণ হয়েছে`);
        else if (result.reason === "cooldown") toast.error("কিছুক্ষণ অপেক্ষা করুন");
        else toast.error("অ্যাড রিওয়ার্ড ব্যর্থ");
        setClaiming(false);
        return;
      }

      const newCount = todayCount + 1;
      const isStreakHit = newCount > 0 && newCount % STREAK_THRESHOLD === 0;

      if (isStreakHit) {
        await adjustCoinsMutation.mutateAsync({
          amount: STREAK_BONUS,
          type: "bonus",
          description: `স্ট্রিক বোনাস! ${STREAK_THRESHOLD}টি অ্যাড দেখেছেন`,
          referenceId: `streak_${newCount}_${new Date().toISOString().slice(0, 10)}`,
          source: "ad_streak_bonus",
        });
        toast.success(`স্ট্রিক বোনাস! +${STREAK_BONUS} কয়েন অতিরিক্ত!`, { duration: 3000 });
      } else {
        toast.success(`+${result.reward} কয়েন পেয়েছেন!`);
      }

      refetchStatus();
      onRewardEarned?.(result.new_balance + (isStreakHit ? STREAK_BONUS : 0));
    } catch {
      toast.error("অ্যাড রিওয়ার্ড ব্যর্থ");
    }
    setClaiming(false);
  }, [placement, todayCount, dailyLimit, claimAdRewardMutation, adjustCoinsMutation, refetchStatus, onRewardEarned]);

  const handleAdSkipped = useCallback(() => {
    setAdOpen(false);
    toast.info("অ্যাড বাতিল করা হয়েছে — কোন রিওয়ার্ড নেই");
  }, []);

  const openAd = useCallback(() => {
    if (!user) { toast.error("লগইন করুন"); return; }
    if (todayCount >= dailyLimit) { toast.error(`আজকের সীমা (${dailyLimit} অ্যাড) পূর্ণ হয়েছে`); return; }
    if (cooldownLeft > 0) { toast.error(`${cooldownLeft} সেকেন্ড অপেক্ষা করুন`); return; }
    setAdOpen(true);
  }, [user, todayCount, dailyLimit, cooldownLeft]);

  if (!user) return null;

  const remaining = Math.max(dailyLimit - todayCount, 0);
  const nextStreakIn = STREAK_THRESHOLD - (todayCount % STREAK_THRESHOLD);
  const isDisabled = claiming || remaining <= 0 || cooldownLeft > 0;

  if (variant === "compact") {
    return (
      <>
        <RewardedAdOverlay open={adOpen} onCompleted={handleAdCompleted} onSkipped={handleAdSkipped} />
        <Button
          size="sm"
          variant="outline"
          className={`text-xs gap-1.5 ${className || ""}`}
          disabled={isDisabled}
          onClick={openAd}
        >
          {claiming ? (
            <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
          ) : (
            <Tv className="w-3 h-3" />
          )}
          {claiming ? "প্রক্রিয়া..." : cooldownLeft > 0 ? `${cooldownLeft}s` : `অ্যাড (+${coinPerAd})`}
        </Button>
      </>
    );
  }

  return (
    <>
      <RewardedAdOverlay open={adOpen} onCompleted={handleAdCompleted} onSkipped={handleAdSkipped} />
      <div className={`rounded-xl border border-border/50 bg-card p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden ${className || ""}`}>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center">
              <Tv className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">অ্যাড দেখে কয়েন আয় করুন</p>
              <p className="text-xs text-muted-foreground">প্রতিটি অ্যাড = {coinPerAd} কয়েন</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">{remaining}/{dailyLimit}</Badge>
        </div>

        <Button className="w-full gap-2 text-sm" disabled={isDisabled} onClick={openAd}>
          {claiming ? (
            <>
              <div className="animate-spin h-4 w-4 shrink-0 border-2 border-primary-foreground border-t-transparent rounded-full" />
              <span className="truncate">প্রক্রিয়া হচ্ছে...</span>
            </>
          ) : cooldownLeft > 0 ? (
            <><Tv className="w-4 h-4 shrink-0" /><span className="truncate">{cooldownLeft}s অপেক্ষা করুন</span></>
          ) : remaining <= 0 ? (
            <><Tv className="w-4 h-4 shrink-0" /><span className="truncate">আজকের সীমা পূর্ণ</span></>
          ) : (
            <><Tv className="w-4 h-4 shrink-0" /><span className="truncate">অ্যাড দেখুন — +{coinPerAd} কয়েন</span></>
          )}
        </Button>

        {remaining > 0 && (
          <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3 shrink-0 text-orange-400" />
              আরো {nextStreakIn}টিতে +{STREAK_BONUS} বোনাস
            </span>
            <span className="flex items-center gap-1">
              <Gift className="w-3 h-3 shrink-0" />
              প্রতি {STREAK_THRESHOLD}টিতে বোনাস
            </span>
          </div>
        )}
      </div>
    </>
  );
}
