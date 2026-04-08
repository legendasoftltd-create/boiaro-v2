import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tv, Coins, Sparkles, ShoppingCart, Lock, Play, Gift, Info, Headphones, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

// Structured logging helper — fire-and-forget
function logEvent(
  module: string, event: string, metadata: Record<string, unknown>,
  userId?: string, level: string = "info"
) {
  const fp = `${module}_${event}_${userId || "anon"}_${metadata.track_id || ""}`;
  supabase.rpc("upsert_system_log", {
    p_level: level,
    p_module: module,
    p_message: event,
    p_fingerprint: fp.slice(0, 120),
    p_user_id: userId ?? null,
    p_metadata: JSON.stringify(metadata),
  }).then(() => {}, () => {}); // swallow errors — logging must never block UX
}

interface QuickUnlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: { id: string; title: string; chapterPrice: number; duration?: string } | null;
  bookId: string;
  audiobookPrice: number;
  fullUnlockCost: number;
  fullUnlockSavingsPercent: number;
  remainingIndividualCost: number;
  lockedCount: number;
  onChapterUnlocked: (trackId: string) => void;
  onFullUnlock: () => void;
}

const DEFAULT_ADS_PER_QUICK_UNLOCK = 5;
const DEFAULT_BONUS_PER_SESSION = 5;
const DEFAULT_AD_COIN_REWARD = 5;

export function QuickUnlockModal({
  open, onOpenChange, track, bookId, audiobookPrice,
  fullUnlockCost, fullUnlockSavingsPercent, remainingIndividualCost,
  lockedCount, onChapterUnlocked, onFullUnlock,
}: QuickUnlockModalProps) {
  const { user } = useAuth();
  const { wallet, refetch } = useWallet();
  const [adsWatched, setAdsWatched] = useState(0);
  const [adsRequired, setAdsRequired] = useState(DEFAULT_ADS_PER_QUICK_UNLOCK);
  const [bonusPerSession, setBonusPerSession] = useState(DEFAULT_BONUS_PER_SESSION);
  const [adCoinReward, setAdCoinReward] = useState(DEFAULT_AD_COIN_REWARD);
  const [watching, setWatching] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [coinPop, setCoinPop] = useState(false);
  const coinPopTimeout = useRef<ReturnType<typeof setTimeout>>();
  const sessionIdRef = useRef<string>("");
  const adInFlightRef = useRef(false); // debounce guard
  const grantedAdsRef = useRef<Set<number>>(new Set()); // prevent double-count

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["ads_per_quick_unlock", "bonus_coin_per_ad_session", "coin_ad_reward"]);
      const map: Record<string, string> = {};
      ((data as any[]) || []).forEach((s: any) => { map[s.key] = s.value; });
      if (map.ads_per_quick_unlock) setAdsRequired(parseInt(map.ads_per_quick_unlock, 10) || DEFAULT_ADS_PER_QUICK_UNLOCK);
      if (map.bonus_coin_per_ad_session) setBonusPerSession(parseInt(map.bonus_coin_per_ad_session, 10) || DEFAULT_BONUS_PER_SESSION);
      setAdCoinReward(parseInt(map.coin_ad_reward, 10) || DEFAULT_AD_COIN_REWARD);
    };
    load();
  }, []);

  useEffect(() => {
    if (open) {
      setAdsWatched(0);
      setUnlocked(false);
      setCoinPop(false);
      adInFlightRef.current = false;
      grantedAdsRef.current = new Set();
      sessionIdRef.current = `qs_${track?.id}_${Date.now()}`;
      if (user && track) {
        logEvent("quick_unlock", "ad_session_started", {
          track_id: track.id, book_id: bookId, chapter_price: track.chapterPrice,
          wallet_balance: wallet.balance, session_id: sessionIdRef.current,
        }, user.id);
      }
    }
  }, [open, track?.id]);

  useEffect(() => {
    return () => { if (coinPopTimeout.current) clearTimeout(coinPopTimeout.current); };
  }, []);

  // --- Derived pricing ---
  const chapterCost = track?.chapterPrice ?? 0;
  const sessionEarnings = (adsRequired * adCoinReward) + bonusPerSession;
  const projectedBalance = wallet.balance + sessionEarnings;
  const isInstantUnlock = projectedBalance >= chapterCost;
  const coinsStillNeeded = Math.max(0, chapterCost - projectedBalance);
  const sessionEarnedSoFar = adsWatched * adCoinReward;
  const currentProjectedBalance = wallet.balance + sessionEarnedSoFar;
  const progressPercent = Math.min((adsWatched / adsRequired) * 100, 100);

  // Smart recommendation: highlight best option
  function canAffordDirectCalc() { return wallet.balance >= chapterCost; }
  const canAffordDirect = canAffordDirectCalc();
  const canAffordFull = wallet.balance >= fullUnlockCost;
  const unlockPercent = chapterCost > 0 ? Math.round((wallet.balance / chapterCost) * 100) : 100;
  const isNearUnlock = isInstantUnlock || unlockPercent >= 80;
  const isFarFromUnlock = unlockPercent < 40;
  const recommendAds = isNearUnlock && !canAffordDirect;
  const recommendBuyCoins = isFarFromUnlock && !canAffordDirect;
  const coinsNeededNow = Math.max(0, chapterCost - wallet.balance);
  const adsEquivalent = Math.ceil(coinsNeededNow / adCoinReward);

  // Motivational microcopy with urgency
  const getMicrocopy = (): { text: string; urgent: boolean } | null => {
    if (adsWatched > 0 && adsWatched < adsRequired) {
      const remaining = adsRequired - adsWatched;
      if (remaining <= 2) return { text: "প্রায় হয়ে গেছে! আর মাত্র কয়েকটি অ্যাড!", urgent: true };
      return { text: `চালিয়ে যান! আরো ${remaining}টি অ্যাড বাকি`, urgent: false };
    }
    if (canAffordDirect) return { text: "পর্যাপ্ত কয়েন আছে — এখনই আনলক করুন!", urgent: true };
    if (isNearUnlock && adsWatched === 0) return { text: `প্রায় আনলক! মাত্র ${coinsNeededNow} কয়েন বাকি`, urgent: true };
    if (isInstantUnlock && adsWatched === 0) return { text: "অ্যাড দেখলেই এই চ্যাপ্টার আনলক হবে!", urgent: true };
    if (recommendBuyCoins) return { text: "কয়েন কিনে তাৎক্ষণিক আনলক করুন", urgent: false };
    if (!isInstantUnlock && adsWatched === 0) return { text: `${adsEquivalent}টি অ্যাড দেখুন অথবা ${coinsNeededNow} কয়েন ব্যবহার করুন`, urgent: false };
    return null;
  };

  const triggerCoinPop = () => {
    setCoinPop(true);
    if (coinPopTimeout.current) clearTimeout(coinPopTimeout.current);
    coinPopTimeout.current = setTimeout(() => setCoinPop(false), 600);
  };

  const handleWatchAd = useCallback(async () => {
    if (!user || watching) return;
    // Debounce: prevent rapid double-taps
    if (adInFlightRef.current) return;
    adInFlightRef.current = true;
    setWatching(true);

    const adIndex = adsWatched + 1;

    // Duplicate guard: if this ad index was already granted, skip
    if (grantedAdsRef.current.has(adIndex)) {
      adInFlightRef.current = false;
      setWatching(false);
      return;
    }

    await new Promise(r => setTimeout(r, 2000));

    const { data, error } = await supabase.rpc("claim_ad_reward", {
      p_ad_placement: `quick_unlock_${bookId}`,
    });

    const result = data as any;
    if (error || !result?.success) {
      const reason = result?.reason || error?.message || "unknown";
      logEvent("quick_unlock", "ad_reward_failed", {
        track_id: track?.id, book_id: bookId, ad_index: adIndex,
        reason, session_id: sessionIdRef.current,
      }, user.id, "warning");

      if (result?.reason === "daily_limit_reached") {
        toast.error("আজকের অ্যাড সীমা শেষ");
      } else {
        toast.error("অ্যাড রিওয়ার্ড ব্যর্থ");
      }
      adInFlightRef.current = false;
      setWatching(false);
      return;
    }

    // Mark this ad index as granted (idempotent within session)
    grantedAdsRef.current.add(adIndex);
    setAdsWatched(adIndex);
    triggerCoinPop();
    refetch();

    logEvent("quick_unlock", "ad_completed", {
      track_id: track?.id, book_id: bookId, ad_index: adIndex,
      coins_awarded: adCoinReward, new_balance: result.new_balance,
      session_id: sessionIdRef.current,
    }, user.id);

    if (adIndex >= adsRequired) {
      // Bonus coins
      if (bonusPerSession > 0) {
        const bonusRefId = `quick_bonus_${track?.id}_${sessionIdRef.current}`;
        await supabase.rpc("adjust_user_coins", {
          p_user_id: user.id,
          p_amount: bonusPerSession,
          p_type: "earn",
          p_description: `অ্যাড সেশন বোনাস! ${adsRequired}টি অ্যাড দেখেছেন`,
          p_reference_id: bonusRefId,
          p_source: "ad_session_bonus",
        });
        logEvent("quick_unlock", "bonus_coins_awarded", {
          track_id: track?.id, book_id: bookId, bonus: bonusPerSession,
          session_id: sessionIdRef.current,
        }, user.id);
        refetch();
      }

      // Attempt auto-unlock
      if (track) {
        const { data: walletData } = await supabase
          .from("user_coins")
          .select("balance")
          .eq("user_id", user.id)
          .single();
        const realBalance = (walletData as any)?.balance || 0;

        if (realBalance >= track.chapterPrice) {
          await performCoinUnlock(track);
        } else {
          const deficit = track.chapterPrice - realBalance;
          logEvent("quick_unlock", "auto_unlock_insufficient", {
            track_id: track.id, book_id: bookId, balance: realBalance,
            cost: track.chapterPrice, deficit, session_id: sessionIdRef.current,
          }, user.id, "warning");
          toast.info(`সেশন সম্পন্ন! আরো ${deficit} কয়েন প্রয়োজন।`);
        }
      }
    } else {
      toast.success(`+${adCoinReward} কয়েন!`, { duration: 1200 });
    }

    adInFlightRef.current = false;
    setWatching(false);
  }, [user, watching, adsWatched, adsRequired, bonusPerSession, bookId, track, refetch, adCoinReward]);

  const performCoinUnlock = useCallback(async (t: { id: string; title: string; chapterPrice: number }) => {
    if (!user) return;
    setUnlocking(true);

    const chapterFormat = `audiobook_chapter_${t.id}`;
    const cost = t.chapterPrice;
    const meta = { track_id: t.id, book_id: bookId, cost, session_id: sessionIdRef.current };

    logEvent("quick_unlock", "unlock_attempt", meta, user.id);

    // Duplicate check: already unlocked?
    const { data: existing } = await supabase
      .from("content_unlocks")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("format", chapterFormat)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      logEvent("quick_unlock", "unlock_duplicate_prevented", meta, user.id);
      toast.info("এই চ্যাপ্টার ইতোমধ্যে আনলক করা আছে");
      setUnlocked(true);
      onChapterUnlocked(t.id);
      setUnlocking(false);
      return;
    }

    // Balance check
    const { data: walletData } = await supabase
      .from("user_coins")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    const currentBalance = (walletData as any)?.balance || 0;

    if (currentBalance < cost) {
      logEvent("quick_unlock", "unlock_failed", { ...meta, balance: currentBalance, reason: "insufficient_coins" }, user.id, "warning");
      toast.error(`আরো ${cost - currentBalance} কয়েন প্রয়োজন`);
      setUnlocking(false);
      return;
    }

    const refId = `quick_ch_${bookId}_${t.id}_${user.id}`;

    const { error: rpcErr } = await supabase.rpc("adjust_user_coins", {
      p_user_id: user.id,
      p_amount: -cost,
      p_type: "spend",
      p_description: `কুইক আনলক - ${t.title}`,
      p_reference_id: refId,
      p_source: "quick_chapter_unlock",
    });

    if (rpcErr) {
      logEvent("quick_unlock", "unlock_failed", { ...meta, reason: "coin_deduct_failed", error: rpcErr.message }, user.id, "error");
      toast.error("কয়েন কাটা ব্যর্থ");
      setUnlocking(false);
      return;
    }

    logEvent("quick_unlock", "coins_deducted", { ...meta, amount: cost, ref_id: refId }, user.id);

    const { error: unlockErr } = await supabase.from("content_unlocks").upsert({
      user_id: user.id,
      book_id: bookId,
      format: chapterFormat,
      coins_spent: cost,
      unlock_method: "coin",
      status: "active",
    }, { onConflict: "user_id,book_id,format" } as any);

    if (unlockErr) {
      // Refund
      await supabase.rpc("adjust_user_coins", {
        p_user_id: user.id,
        p_amount: cost,
        p_type: "earn",
        p_description: `রিফান্ড: কুইক আনলক ব্যর্থ - ${t.title}`,
        p_reference_id: `refund_${refId}`,
        p_source: "quick_unlock_refund",
      });
      logEvent("quick_unlock", "unlock_failed_refunded", { ...meta, reason: "db_upsert_failed", error: unlockErr.message }, user.id, "error");
      toast.error("আনলক ব্যর্থ, কয়েন ফেরত দেওয়া হয়েছে");
      setUnlocking(false);
      return;
    }

    logEvent("quick_unlock", "unlock_success", meta, user.id);
    setUnlocked(true);
    refetch();
    onChapterUnlocked(t.id);
    setUnlocking(false);
  }, [user, bookId, refetch, onChapterUnlocked, sessionIdRef]);

  const handleDirectCoinUnlock = useCallback(async () => {
    if (!track) return;
    await performCoinUnlock(track);
  }, [track, performCoinUnlock]);

  if (!track) return null;

  const microcopy = getMicrocopy();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
        {/* Unlocked success state */}
        {unlocked ? (
          <div className="text-center py-10 px-6 space-y-4 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-scale-in">
              <Headphones className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold">আনলক সম্পন্ন! 🎉</p>
              <p className="text-sm text-muted-foreground">"{track.title}" এখন শোনার জন্য প্রস্তুত</p>
            </div>
            <Button onClick={() => onOpenChange(false)} size="lg" className="gap-2 w-full animate-fade-in">
              <Play className="w-5 h-5" /> এখনই শুনুন
            </Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-3">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5 text-base">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span className="block">এপিসোড আনলক করুন</span>
                    <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                      "{track.title}" {track.duration && `• ${track.duration}`}
                    </span>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {/* Chapter price badge */}
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                  <Coins className="w-3 h-3" /> মূল্য: {chapterCost} কয়েন
                </Badge>
                <Badge variant="outline" className="text-xs gap-1 py-1 px-2.5 text-muted-foreground">
                  ব্যালেন্স: {wallet.balance}
                </Badge>
              </div>
            </div>

            <div className="px-5 pb-5 space-y-3">
              {/* Urgency / Microcopy */}
              {microcopy && (
                <div className={`text-xs font-medium flex items-center gap-1.5 animate-fade-in rounded-lg px-3 py-2 ${
                  microcopy.urgent
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                }`}>
                  <Zap className={`w-3.5 h-3.5 flex-shrink-0 ${microcopy.urgent ? "animate-pulse" : ""}`} />
                  {microcopy.text}
                </div>
              )}

              {/* Comparison bar */}
              {!canAffordDirect && coinsNeededNow > 0 && adsWatched === 0 && (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1"><Tv className="w-3 h-3" /> {adsEquivalent} অ্যাড দেখুন</span>
                  <span className="text-muted-foreground/60">অথবা</span>
                  <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> {coinsNeededNow} কয়েন ব্যবহার করুন</span>
                </div>
              )}

              {/* Option 1: Ad Session — highlighted when near unlock */}
              <div className={`rounded-xl border-2 p-4 space-y-3 relative transition-all ${
                recommendAds || (!canAffordDirect && !recommendBuyCoins)
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/50 bg-card"
              }`}>
                {(recommendAds || (!canAffordDirect && !recommendBuyCoins)) && (
                  <Badge className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-[10px] px-2 animate-fade-in">
                    {isInstantUnlock ? "তাৎক্ষণিক আনলক" : isNearUnlock ? "প্রায় হয়ে গেছে!" : "কয়েন আয়"}
                  </Badge>
                )}

                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Tv className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {isInstantUnlock
                        ? `${adsRequired}টি অ্যাড দেখে আনলক করুন`
                        : `${adsRequired}টি অ্যাড দেখে ${sessionEarnings} কয়েন আয় করুন`
                      }
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {adsRequired} × {adCoinReward} + {bonusPerSession} বোনাস = {sessionEarnings} কয়েন
                    </p>
                  </div>
                </div>

                {/* Compact coin breakdown */}
                <div className="rounded-lg bg-background/70 p-2.5 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">সেশনে আয়</span>
                    <span className={`font-medium transition-all ${coinPop ? "text-primary scale-110" : "text-primary"}`}>
                      +{sessionEarnedSoFar}/{sessionEarnings} কয়েন
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">সেশন পরে ব্যালেন্স</span>
                    <span className={`font-medium ${
                      (wallet.balance + sessionEarnings) >= chapterCost ? "text-primary" : "text-foreground"
                    }`}>
                      ~{adsWatched < adsRequired
                        ? wallet.balance + sessionEarnings
                        : currentProjectedBalance
                      } কয়েন
                    </span>
                  </div>
                  {!isInstantUnlock && (
                    <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground/80">
                      <Info className="w-3 h-3 flex-shrink-0" />
                      সেশন শেষে আরো {coinsStillNeeded} কয়েন দরকার
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">অ্যাড প্রগ্রেস</span>
                    <span className="font-semibold text-primary">{adsWatched}/{adsRequired}</span>
                  </div>
                  <Progress value={progressPercent} className="h-2.5" />
                </div>

                <Button
                  className="w-full gap-2 h-10"
                  disabled={watching || unlocking || adsWatched >= adsRequired}
                  onClick={handleWatchAd}
                >
                  {watching ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                      অ্যাড চলছে...
                    </>
                  ) : adsWatched >= adsRequired ? (
                    <>
                      <Gift className="w-4 h-4" />
                      {isInstantUnlock ? "আনলক হচ্ছে..." : "সেশন সম্পন্ন!"}
                    </>
                  ) : (
                    <>
                      <Tv className="w-4 h-4" />
                      অ্যাড দেখুন ({adsWatched + 1}/{adsRequired})
                    </>
                  )}
                </Button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 py-0.5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground">অথবা</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Option 2: Direct Coin / Buy Coins — conversion focused */}
              <div className={`rounded-xl border-2 p-3 space-y-2 transition-all ${
                canAffordDirect ? "border-primary/40 bg-primary/5" :
                recommendBuyCoins ? "border-accent/40 bg-accent/10" : "border-border/50"
              }`}>
                {canAffordDirect ? (
                  <Badge className="bg-primary text-primary-foreground text-[10px] px-2 mb-1">
                    এখনই আনলক করুন
                  </Badge>
                ) : recommendBuyCoins ? (
                  <Badge className="bg-accent text-accent-foreground text-[10px] px-2 mb-1">
                    ⚡ তাৎক্ষণিক আনলক
                  </Badge>
                ) : null}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        {canAffordDirect
                          ? `${chapterCost} কয়েন দিয়ে আনলক`
                          : `কয়েন কিনে তাৎক্ষণিক আনলক করুন`
                        }
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {canAffordDirect
                          ? "পর্যাপ্ত ব্যালেন্স আছে!"
                          : `মাত্র ${coinsNeededNow} কয়েন দরকার`
                        }
                      </p>
                    </div>
                  </div>
                  {canAffordDirect ? (
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={unlocking}
                      onClick={handleDirectCoinUnlock}
                    >
                      <Coins className="w-3 h-3" /> {chapterCost}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" asChild>
                      <Link to="/coin-store">
                        <ShoppingCart className="w-3 h-3" /> কয়েন কিনুন
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Option 3: Full Audiobook — best deal when far from unlock */}
              {lockedCount > 1 && fullUnlockCost > 0 && (
                <div className={`rounded-xl border p-3 transition-all ${
                  recommendBuyCoins && !canAffordDirect ? "border-primary/30 bg-primary/5" : "border-border/50"
                }`}>
                  {recommendBuyCoins && !canAffordDirect && (
                    <Badge className="bg-primary text-primary-foreground text-[10px] px-2 mb-2">
                      সেরা অফার
                    </Badge>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">সম্পূর্ণ অডিওবুক</p>
                        <p className="text-[11px] text-muted-foreground">
                          <span className="line-through opacity-60">{remainingIndividualCost}</span>{" "}
                          <span className="text-primary font-bold">{fullUnlockCost} কয়েন</span>
                          {fullUnlockSavingsPercent > 0 && (
                            <Badge variant="outline" className="ml-1 border-emerald-500/30 text-emerald-500 text-[10px] px-1 py-0">
                              {fullUnlockSavingsPercent}% সেভ
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      disabled={!canAffordFull || unlocking}
                      onClick={onFullUnlock}
                    >
                      <Coins className="w-3 h-3" /> {fullUnlockCost}
                    </Button>
                  </div>
                </div>
              )}

              {/* Cash purchase */}
              <Button size="sm" variant="ghost" className="w-full text-xs gap-1.5 text-muted-foreground h-9" asChild>
                <Link to={`/checkout?book_id=${bookId}&format=audiobook`}>
                  <ShoppingCart className="w-3.5 h-3.5" /> ক্যাশে কিনুন — ৳{audiobookPrice}
                </Link>
              </Button>

              {/* Footer info */}
              <p className="text-[10px] text-muted-foreground/60 text-center pt-1">
                ১ অ্যাড = {adCoinReward} কয়েন • কয়েন দিয়ে আনলক • কোন জোরপূর্বক অ্যাড নেই
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
