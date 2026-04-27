import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useWallet } from "@/hooks/useWallet";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Gift, Play, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function RewardCenter() {
  const { user } = useAuth();
  const { wallet, transactions, refetch } = useWallet();
  const [claiming, setClaiming] = useState(false);

  const { data: settings } = trpc.wallet.coinSettings.useQuery(undefined, { enabled: !!user });
  const { data: adStatus, refetch: refetchAdStatus } = trpc.gamification.adRewardStatus.useQuery(undefined, { enabled: !!user });
  const claimAdRewardMutation = trpc.gamification.claimAdReward.useMutation();
  const adjustCoinsMutation = trpc.wallet.adjustCoins.useMutation();

  const coinsPerAd = settings?.coinAdReward ?? 5;
  const maxPerDay = adStatus?.dailyLimit ?? 10;
  const todayCount = adStatus?.todayCount ?? 0;
  const cooldownMin = 5; // from settings ideally, hardcoded for now

  const rewardHistory = transactions.filter((t: any) => t.source === "ad_reward").slice(0, 15);

  const lastRewardTx = rewardHistory[0];
  const lastRewardTime = lastRewardTx ? new Date(lastRewardTx.created_at) : null;

  const cooldownRemaining = () => {
    if (!lastRewardTime) return 0;
    const diff = cooldownMin - (Date.now() - lastRewardTime.getTime()) / 60000;
    return Math.max(0, Math.ceil(diff));
  };

  const canWatch = () => {
    if (todayCount >= maxPerDay) return false;
    if (lastRewardTime) {
      const diff = (Date.now() - lastRewardTime.getTime()) / 60000;
      if (diff < cooldownMin) return false;
    }
    return true;
  };

  const handleWatchAd = async () => {
    if (!user || !canWatch()) return;
    setClaiming(true);

    await new Promise(r => setTimeout(r, 2000));

    const result = await claimAdRewardMutation.mutateAsync({ placement: "reward_center" }).catch(() => null);
    if (!result?.success) {
      if (result?.reason === "daily_limit_reached") {
        toast.error("আজকের সীমা শেষ। আগামীকাল আবার চেষ্টা করুন!");
      } else {
        // Fallback: use adjustCoins directly
        await adjustCoinsMutation.mutateAsync({
          amount: coinsPerAd,
          type: "earn",
          description: `বিজ্ঞাপন থেকে কয়েন অর্জন`,
          source: "ad_reward",
        }).catch(() => toast.error("কয়েন যোগ ব্যর্থ"));
      }
    } else {
      toast.success(`🎉 ${coinsPerAd} কয়েন যোগ হয়েছে!`);
    }

    refetch();
    refetchAdStatus();
    setClaiming(false);
  };

  if (!user) return null;

  const remaining = maxPerDay - todayCount;
  const cooldown = cooldownRemaining();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-8 max-w-3xl">
        <h1 className="text-2xl font-serif font-bold mb-6 flex items-center gap-2">
          <Gift className="w-6 h-6 text-primary" /> রিওয়ার্ড সেন্টার
        </h1>

        {/* Wallet Card */}
        <Card className="border-primary/30 bg-primary/5 mb-6">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Coins className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">আপনার ব্যালেন্স</p>
                <p className="text-3xl font-bold text-primary">{wallet.balance}</p>
              </div>
            </div>
            <Badge className="bg-primary/20 text-primary text-sm px-3 py-1">কয়েন</Badge>
          </CardContent>
        </Card>

        {/* Watch Ad Section */}
        <Card className="border-border/30 mb-6">
          <CardHeader>
            <CardTitle className="text-base font-serif">বিজ্ঞাপন দেখে কয়েন অর্জন করুন</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/40">
              <div>
                <p className="font-medium">প্রতি বিজ্ঞাপনে</p>
                <p className="text-2xl font-bold text-primary">{coinsPerAd} কয়েন</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>আজ বাকি: <span className="font-bold text-foreground">{remaining}/{maxPerDay}</span></p>
              </div>
            </div>

            {remaining <= 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-400">
                <AlertCircle className="w-4 h-4" />
                <p className="text-sm">আজকের সীমা শেষ। আগামীকাল আবার চেষ্টা করুন!</p>
              </div>
            ) : cooldown > 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 text-blue-400">
                <Clock className="w-4 h-4" />
                <p className="text-sm">পরবর্তী বিজ্ঞাপন {cooldown} মিনিটে উপলব্ধ হবে</p>
              </div>
            ) : (
              <Button
                onClick={handleWatchAd}
                disabled={claiming || !canWatch()}
                className="w-full h-14 text-lg"
              >
                {claiming ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                    বিজ্ঞাপন দেখা হচ্ছে...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    বিজ্ঞাপন দেখুন ও {coinsPerAd} কয়েন পান
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Reward History */}
        <Card className="border-border/30">
          <CardHeader>
            <CardTitle className="text-base font-serif">রিওয়ার্ড ইতিহাস</CardTitle>
          </CardHeader>
          <CardContent>
            {rewardHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">এখনো কোনো রিওয়ার্ড নেই</p>
            ) : (
              <div className="space-y-2">
                {rewardHistory.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <div>
                        <p className="text-sm font-medium">+{r.amount} কয়েন</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString("bn-BD")}</p>
                      </div>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">completed</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
