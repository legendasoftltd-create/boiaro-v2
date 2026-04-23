import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tv, Flame, Gift } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onRewardEarned?: (newBalance: number) => void;
  placement?: string;
  variant?: "default" | "compact";
  className?: string;
}

const STREAK_THRESHOLD = 5; // every 5 ads = bonus
const STREAK_BONUS = 2;     // bonus coins

export function WatchAdButton({ onRewardEarned, placement = "general", variant = "default", className }: Props) {
  const { user } = useAuth();
  const [watching, setWatching] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState<number>(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const { data: adStatus } = trpc.gamification.adRewardStatus.useQuery(undefined, {
    enabled: !!user,
  });
  const todayCount = adStatus?.todayCount ?? 0;
  const dailyLimit = adStatus?.dailyLimit ?? 10;

  const claimAdRewardMutation = trpc.gamification.claimAdReward.useMutation();
  const adjustCoinsMutation = trpc.wallet.adjustCoins.useMutation();

  // Cooldown timer
  useEffect(() => {
    if (cooldownEnd <= Date.now()) { setCooldownLeft(0); return; }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
      setCooldownLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  const handleWatchAd = useCallback(async () => {
    if (!user) { toast.error("লগইন করুন"); return; }
    if (todayCount >= dailyLimit) {
      toast.error(`আজকের সীমা (${dailyLimit} অ্যাড) পূর্ণ হয়েছে`);
      return;
    }
    if (cooldownLeft > 0) {
      toast.error(`${cooldownLeft} সেকেন্ড অপেক্ষা করুন`);
      return;
    }

    setWatching(true);

    // Simulate ad watch (replace with real ad SDK later)
    await new Promise(r => setTimeout(r, 2000));

    try {
      const result = await claimAdRewardMutation.mutateAsync({ placement });

      if (!result.success) {
        toast.error(result.reason === "daily_limit_reached" ? "আজকের অ্যাড সীমা শেষ" : "অ্যাড রিওয়ার্ড ব্যর্থ");
        setWatching(false);
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

      setCooldownEnd(Date.now() + 30 * 1000);
      onRewardEarned?.(result.new_balance + (isStreakHit ? STREAK_BONUS : 0));
    } catch {
      toast.error("অ্যাড রিওয়ার্ড ব্যর্থ");
    }

    setWatching(false);
  }, [user, todayCount, dailyLimit, cooldownLeft, placement, onRewardEarned, claimAdRewardMutation, adjustCoinsMutation]);

  if (!user) return null;

  const remaining = Math.max(dailyLimit - todayCount, 0);
  const nextStreakIn = STREAK_THRESHOLD - (todayCount % STREAK_THRESHOLD);
  const isDisabled = watching || remaining <= 0 || cooldownLeft > 0;

  if (variant === "compact") {
    return (
      <Button
        size="sm"
        variant="outline"
        className={`text-xs gap-1.5 ${className || ""}`}
        disabled={isDisabled}
        onClick={handleWatchAd}
      >
        {watching ? (
          <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
        ) : (
          <Tv className="w-3 h-3" />
        )}
        {watching ? "দেখা হচ্ছে..." : cooldownLeft > 0 ? `${cooldownLeft}s` : `অ্যাড (+1)`}
      </Button>
    );
  }

  return (
    <div className={`rounded-xl border border-border/50 bg-card p-4 space-y-3 ${className || ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Tv className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">অ্যাড দেখে কয়েন আয় করুন</p>
            <p className="text-xs text-muted-foreground">
              প্রতিটি অ্যাড = ১ কয়েন
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs">
          {remaining}/{dailyLimit}
        </Badge>
      </div>

      <Button
        className="w-full gap-2"
        disabled={isDisabled}
        onClick={handleWatchAd}
      >
        {watching ? (
          <>
            <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
            অ্যাড দেখা হচ্ছে...
          </>
        ) : cooldownLeft > 0 ? (
          <>
            <Tv className="w-4 h-4" />
            {cooldownLeft}s অপেক্ষা করুন
          </>
        ) : remaining <= 0 ? (
          <>
            <Tv className="w-4 h-4" />
            আজকের সীমা পূর্ণ
          </>
        ) : (
          <>
            <Tv className="w-4 h-4" />
            অ্যাড দেখুন — +1 কয়েন
          </>
        )}
      </Button>

      {/* Streak progress */}
      {remaining > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-400" />
            আরো {nextStreakIn}টি অ্যাডে +{STREAK_BONUS} বোনাস কয়েন
          </span>
          <span className="flex items-center gap-1">
            <Gift className="w-3 h-3" />
            প্রতি {STREAK_THRESHOLD}টিতে বোনাস
          </span>
        </div>
      )}
    </div>
  );
}
