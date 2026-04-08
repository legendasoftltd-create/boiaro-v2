import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Gift, Play, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function RewardCenter() {
  const { user } = useAuth();
  const [coinBalance, setCoinBalance] = useState(0);
  const [coinsPerAd, setCoinsPerAd] = useState(5);
  const [maxPerDay, setMaxPerDay] = useState(10);
  const [cooldownMin, setCooldownMin] = useState(5);
  const [todayCount, setTodayCount] = useState(0);
  const [rewardHistory, setRewardHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [lastRewardTime, setLastRewardTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [settingsRes, walletRes, logsRes] = await Promise.all([
        supabase.from("platform_settings").select("*").in("key", ["ad_rewarded_coins", "ad_max_per_day", "ad_cooldown_minutes", "ad_system_enabled"]),
        supabase.from("user_coins" as any).select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("rewarded_ad_logs" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      ]);

      const settings: Record<string, string> = {};
      ((settingsRes.data as any[]) || []).forEach((s: any) => { settings[s.key] = s.value; });
      setCoinsPerAd(parseInt(settings.ad_rewarded_coins) || 5);
      setMaxPerDay(parseInt(settings.ad_max_per_day) || 10);
      setCooldownMin(parseInt(settings.ad_cooldown_minutes) || 5);
      setCoinBalance((walletRes.data as any)?.balance || 0);

      const logs = (logsRes.data as any[]) || [];
      setRewardHistory(logs);

      // Count today's rewards
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayLogs = logs.filter((l: any) => new Date(l.created_at) >= todayStart);
      setTodayCount(todayLogs.length);
      if (todayLogs.length > 0) setLastRewardTime(new Date(todayLogs[0].created_at));

      setLoading(false);
    };
    load();
  }, [user]);

  const canWatch = () => {
    if (todayCount >= maxPerDay) return false;
    if (lastRewardTime) {
      const diff = (Date.now() - lastRewardTime.getTime()) / 60000;
      if (diff < cooldownMin) return false;
    }
    return true;
  };

  const cooldownRemaining = () => {
    if (!lastRewardTime) return 0;
    const diff = cooldownMin - (Date.now() - lastRewardTime.getTime()) / 60000;
    return Math.max(0, Math.ceil(diff));
  };

  const handleWatchAd = async () => {
    if (!user || !canWatch()) return;
    setClaiming(true);

    // Simulate ad watch (2s delay)
    await new Promise(r => setTimeout(r, 2000));

    const eventId = `reward_${user.id}_${Date.now()}`;

    // Insert reward log (unique constraint prevents duplicates)
    const { error: logErr } = await supabase.from("rewarded_ad_logs" as any).insert({
      user_id: user.id,
      ad_event_id: eventId,
      coins_rewarded: coinsPerAd,
      status: "completed",
      placement_key: "reward_center",
    });
    if (logErr) { toast.error("Reward already claimed"); setClaiming(false); return; }

    // Use secure RPC to adjust coins (handles balance + transaction atomically)
    const { error: rpcErr } = await supabase.rpc("adjust_user_coins", {
      p_user_id: user.id,
      p_amount: coinsPerAd,
      p_type: "earn",
      p_description: `Rewarded ad - ${coinsPerAd} coins`,
      p_reference_id: eventId,
    });
    if (rpcErr) { toast.error("কয়েন যোগ ব্যর্থ"); setClaiming(false); return; }

    setCoinBalance(b => b + coinsPerAd);
    setTodayCount(c => c + 1);
    setLastRewardTime(new Date());
    setRewardHistory(h => [{ id: eventId, coins_rewarded: coinsPerAd, created_at: new Date().toISOString(), status: "completed" }, ...h]);

    toast.success(`🎉 ${coinsPerAd} কয়েন যোগ হয়েছে!`);
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
                <p className="text-3xl font-bold text-primary">{loading ? "—" : coinBalance}</p>
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
                {rewardHistory.slice(0, 15).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <div>
                        <p className="text-sm font-medium">+{r.coins_rewarded} কয়েন</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString("bn-BD")}</p>
                      </div>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">{r.status}</Badge>
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
