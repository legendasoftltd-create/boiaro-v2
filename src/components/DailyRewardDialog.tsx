import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, Gift, Flame } from "lucide-react";
import { toast } from "sonner";

export function DailyRewardDialog() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [claimed, setClaimed] = useState<{ day: number; reward: number } | null>(null);
  const didOpen = useRef(false);

  const { data: status } = trpc.gamification.dailyRewardStatus.useQuery(undefined, { enabled: !!user });
  const claimMutation = trpc.gamification.claimDailyReward.useMutation();

  useEffect(() => {
    if (!status || didOpen.current) return;
    didOpen.current = true;
    if (!status.claimed_today) setOpen(true);
  }, [status]);

  const handleClaim = async () => {
    try {
      const result = await claimMutation.mutateAsync();
      if (result?.success) {
        setClaimed({ day: result.day!, reward: result.reward! });
        utils.gamification.dailyRewardStatus.invalidate();
        utils.gamification.streaks.invalidate();
        toast.success(`🎉 Day ${result.day} পুরস্কার: +${result.reward} কয়েন!`);
      } else if (result?.reason === "already_claimed") {
        toast.info("আজকের পুরস্কার ইতোমধ্যে নেওয়া হয়েছে");
        setOpen(false);
      }
    } catch {
      toast.error("পুরস্কার নেওয়া ব্যর্থ হয়েছে");
    }
  };

  if (!user || !status) return null;

  const schedule = status.schedule;
  const currentDay = claimed?.day ?? status.day;
  const isClaimed = claimed !== null || status.claimed_today;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Gift className="w-5 h-5 text-primary" /> দৈনিক লগইন পুরস্কার
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 py-2">
          {schedule.map((coins, i) => {
            const day = i + 1;
            const isPast = day < currentDay || (day === currentDay && isClaimed);
            const isToday = day === currentDay && !isClaimed;
            return (
              <div
                key={day}
                className={`rounded-xl border p-2 text-center transition-all ${
                  isToday
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : isPast
                      ? "border-primary/20 bg-primary/5 opacity-70"
                      : "border-border/20 bg-secondary/10 opacity-50"
                }`}
              >
                <p className="text-[10px] text-muted-foreground mb-1">Day {day}</p>
                <Coins className={`w-4 h-4 mx-auto mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-[11px] font-semibold">{coins}</p>
                {isPast && <p className="text-[9px] text-primary mt-0.5">✓</p>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-500" /> Day {currentDay} of 7</span>
          <span>প্রতিদিন লগইন করে বেশি কয়েন অর্জন করুন</span>
        </div>

        {isClaimed ? (
          <Button disabled className="w-full">নেওয়া হয়েছে ✓</Button>
        ) : (
          <Button onClick={handleClaim} disabled={claimMutation.isPending} className="w-full gap-2">
            <Gift className="w-4 h-4" /> {claimMutation.isPending ? "নেওয়া হচ্ছে..." : `+${status.reward} কয়েন নিন`}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
