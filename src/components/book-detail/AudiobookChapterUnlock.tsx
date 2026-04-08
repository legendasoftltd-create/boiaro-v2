import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Unlock, Lock, Sparkles, ShoppingCart, AlertCircle, Tv } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { WatchAdButton } from "@/components/WatchAdButton";
import { QuickUnlockModal } from "@/components/book-detail/QuickUnlockModal";
import type { AudioTrack } from "@/contexts/AudioPlayerContext";

interface Props {
  bookId: string;
  tracks: AudioTrack[];
  audiobookPrice: number;
  onUnlocked: () => void;
}

const DEFAULT_COINS_PER_CHAPTER = 100;
const FULL_UNLOCK_DISCOUNT = 0.25;
const MINIMUM_COST_FLOOR = 0.20;
const DEFAULT_AD_COIN_REWARD = 5;

interface TrackWithPrice extends AudioTrack {
  chapterPrice: number;
}

/** Calculate fair full-unlock coin cost with discount, floor, and cap */
function calcFullUnlockCost(
  nonPreviewTracks: TrackWithPrice[],
  unlockedIds: Set<string>
): { cost: number; totalOriginal: number; remainingIndividual: number } {
  const remaining = nonPreviewTracks.filter(t => !unlockedIds.has(t.id));
  if (remaining.length <= 0) return { cost: 0, totalOriginal: 0, remainingIndividual: 0 };

  const totalOriginal = nonPreviewTracks.reduce((s, t) => s + t.chapterPrice, 0);
  const remainingIndividualCost = remaining.reduce((s, t) => s + t.chapterPrice, 0);
  const floorCost = Math.ceil(totalOriginal * MINIMUM_COST_FLOOR);
  const discountedCost = Math.ceil(remainingIndividualCost * (1 - FULL_UNLOCK_DISCOUNT));

  const withFloor = floorCost <= remainingIndividualCost
    ? Math.max(discountedCost, floorCost)
    : discountedCost;

  const cost = Math.min(Math.max(withFloor, 1), remainingIndividualCost);
  return { cost, totalOriginal, remainingIndividual: remainingIndividualCost };
}

export function AudiobookChapterUnlock({ bookId, tracks, audiobookPrice, onUnlocked }: Props) {
  const { user } = useAuth();
  const { wallet, refetch } = useWallet();
  const [unlockedChapters, setUnlockedChapters] = useState<Set<string>>(new Set());
  const [hasFullUnlock, setHasFullUnlock] = useState(false);
  const [_unlocking, setUnlocking] = useState<string | null>(null);
  const [fullUnlocking, setFullUnlocking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coinEnabled, setCoinEnabled] = useState(false);
  const [adCoinReward, setAdCoinReward] = useState(DEFAULT_AD_COIN_REWARD);
  const [chapterPrices, setChapterPrices] = useState<Record<string, number>>({});
  const [modalTrack, setModalTrack] = useState<TrackWithPrice | null>(null);

  const tracksWithPrices: TrackWithPrice[] = tracks.map(t => ({
    ...t,
    chapterPrice: chapterPrices[t.id] ?? DEFAULT_COINS_PER_CHAPTER,
  }));
  const nonPreviewTracks = tracksWithPrices.filter(t => !t.isPreview);

  useEffect(() => {
    const load = async () => {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("*")
        .in("key", ["coin_system_enabled", "coin_unlock_enabled", "coin_ad_reward"]);
      const map: Record<string, string> = {};
      ((settings as any[]) || []).forEach((s: any) => { map[s.key] = s.value; });
      setCoinEnabled(map.coin_system_enabled === "true" && map.coin_unlock_enabled === "true");
      setAdCoinReward(parseInt(map.coin_ad_reward, 10) || DEFAULT_AD_COIN_REWARD);

      const trackIds = tracks.map(t => t.id);
      if (trackIds.length > 0) {
        const { data: trackData } = await supabase
          .from("audiobook_tracks")
          .select("id, chapter_price")
          .in("id", trackIds);
        const prices: Record<string, number> = {};
        (trackData || []).forEach((t: any) => {
          if (t.chapter_price != null) prices[t.id] = Number(t.chapter_price);
        });
        setChapterPrices(prices);
      }

      if (user) {
        const { data: unlocks } = await supabase
          .from("content_unlocks")
          .select("format, book_id, id")
          .eq("user_id", user.id)
          .eq("book_id", bookId)
          .eq("status", "active");

        const set = new Set<string>();
        let fullFound = false;
        (unlocks || []).forEach((u: any) => {
          if (u.format === "audiobook") fullFound = true;
          const match = u.format?.match(/^audiobook_chapter_(.+)$/);
          if (match) set.add(match[1]);
        });
        setUnlockedChapters(set);
        setHasFullUnlock(fullFound);
      }
      setLoading(false);
    };
    load();
  }, [user, bookId, tracks]);

  const logDuplicatePrevented = useCallback(async (format: string) => {
    if (!user) return;
    await supabase.rpc("upsert_system_log", {
      p_level: "info",
      p_module: "chapter_unlock",
      p_message: "Duplicate unlock attempt prevented",
      p_fingerprint: `dup_unlock_${user.id}_${bookId}_${format}`,
      p_user_id: user.id,
      p_metadata: JSON.stringify({
        user_id: user.id, book_id: bookId, format, action: "duplicate_prevented",
      }),
    });
  }, [user, bookId]);

  const isChapterUnlockable = useCallback((track: TrackWithPrice, index: number): boolean => {
    if (index === 0) return true;
    const nonPreviewIndex = nonPreviewTracks.findIndex(t => t.id === track.id);
    if (nonPreviewIndex <= 0) return true;
    const prevTrack = nonPreviewTracks[nonPreviewIndex - 1];
    return unlockedChapters.has(prevTrack.id);
  }, [nonPreviewTracks, unlockedChapters]);

  const _handleCoinUnlock = useCallback(async (track: TrackWithPrice) => {
    if (!user) return;
    const chapterFormat = `audiobook_chapter_${track.id}`;
    const chapterCost = track.chapterPrice;

    if (unlockedChapters.has(track.id)) {
      toast.info("এই চ্যাপ্টার ইতোমধ্যে আনলক করা হয়েছে");
      logDuplicatePrevented(chapterFormat);
      return;
    }

    const trackIdx = nonPreviewTracks.findIndex(t => t.id === track.id);
    if (!isChapterUnlockable(track, trackIdx)) {
      toast.error("আগের চ্যাপ্টার প্রথমে আনলক করুন");
      return;
    }

    const { data: existing } = await supabase
      .from("content_unlocks")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("format", chapterFormat)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      setUnlockedChapters(prev => new Set(prev).add(track.id));
      toast.info("এই চ্যাপ্টার ইতোমধ্যে আনলক করা হয়েছে");
      logDuplicatePrevented(chapterFormat);
      return;
    }

    if (wallet.balance < chapterCost) {
      toast.error(`${chapterCost} কয়েন প্রয়োজন (বর্তমান: ${wallet.balance})`);
      return;
    }
    setUnlocking(track.id);

    const refId = `ch_unlock_${bookId}_${track.id}_${user.id}`;

    const { error: rpcErr } = await supabase.rpc("adjust_user_coins", {
      p_user_id: user.id,
      p_amount: -chapterCost,
      p_type: "spend",
      p_description: `অডিওবুক চ্যাপ্টার আনলক - ${track.title}`,
      p_reference_id: refId,
      p_source: "chapter_unlock",
    });

    if (rpcErr) {
      toast.error("কয়েন কাটা ব্যর্থ হয়েছে");
      setUnlocking(null);
      return;
    }

    const { error: unlockErr } = await supabase.from("content_unlocks").upsert({
      user_id: user.id,
      book_id: bookId,
      format: chapterFormat,
      coins_spent: chapterCost,
      unlock_method: "coin",
      status: "active",
    }, { onConflict: "user_id,book_id,format" } as any);

    if (unlockErr) {
      await supabase.rpc("adjust_user_coins", {
        p_user_id: user.id,
        p_amount: chapterCost,
        p_type: "earn",
        p_description: `রিফান্ড: চ্যাপ্টার আনলক ব্যর্থ - ${track.title}`,
        p_reference_id: `refund_${refId}`,
        p_source: "chapter_unlock_refund",
      });
      toast.error("আনলক ব্যর্থ হয়েছে, কয়েন ফেরত দেওয়া হয়েছে");
      setUnlocking(null);
      return;
    }

    setUnlockedChapters(prev => new Set(prev).add(track.id));
    toast.success(`🎧 "${track.title}" আনলক হয়েছে!`);
    refetch();
    onUnlocked();
    setUnlocking(null);
  }, [user, wallet, bookId, refetch, onUnlocked, unlockedChapters, logDuplicatePrevented, nonPreviewTracks, isChapterUnlockable]);

  const handleFullCoinUnlock = useCallback(async () => {
    if (!user) return;

    const { data: existing } = await supabase
      .from("content_unlocks")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .eq("format", "audiobook")
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      setHasFullUnlock(true);
      toast.info("ইতোমধ্যে সম্পূর্ণ অডিওবুক আনলক করা আছে");
      logDuplicatePrevented("audiobook");
      return;
    }

    const { cost: adjustedCost } = calcFullUnlockCost(nonPreviewTracks, unlockedChapters);
    if (adjustedCost <= 0) {
      toast.info("সব চ্যাপ্টার ইতোমধ্যে আনলক করা আছে");
      return;
    }

    if (wallet.balance < adjustedCost) {
      toast.error(`${adjustedCost} কয়েন প্রয়োজন (বর্তমান: ${wallet.balance})`);
      return;
    }

    setFullUnlocking(true);
    const refId = `full_unlock_${bookId}_${user.id}`;
    const remaining = nonPreviewTracks.filter(t => !unlockedChapters.has(t.id));

    const { error: rpcErr } = await supabase.rpc("adjust_user_coins", {
      p_user_id: user.id,
      p_amount: -adjustedCost,
      p_type: "spend",
      p_description: `সম্পূর্ণ অডিওবুক আনলক (${remaining.length} চ্যাপ্টার + ভবিষ্যৎ চ্যাপ্টার)`,
      p_reference_id: refId,
      p_source: "full_audiobook_unlock",
    });

    if (rpcErr) {
      toast.error("কয়েন কাটা ব্যর্থ হয়েছে");
      setFullUnlocking(false);
      return;
    }

    const { error: unlockErr } = await supabase.from("content_unlocks").upsert({
      user_id: user.id,
      book_id: bookId,
      format: "audiobook",
      coins_spent: adjustedCost,
      unlock_method: "coin",
      status: "active",
    }, { onConflict: "user_id,book_id,format" } as any);

    if (unlockErr) {
      await supabase.rpc("adjust_user_coins", {
        p_user_id: user.id,
        p_amount: adjustedCost,
        p_type: "earn",
        p_description: `রিফান্ড: সম্পূর্ণ অডিওবুক আনলক ব্যর্থ`,
        p_reference_id: `refund_${refId}`,
        p_source: "full_unlock_refund",
      });
      toast.error("আনলক ব্যর্থ হয়েছে, কয়েন ফেরত দেওয়া হয়েছে");
      setFullUnlocking(false);
      return;
    }

    setHasFullUnlock(true);
    setModalTrack(null);
    toast.success("🎉 সম্পূর্ণ অডিওবুক আনলক হয়েছে!");
    refetch();
    onUnlocked();
    setFullUnlocking(false);
  }, [user, wallet, bookId, nonPreviewTracks, unlockedChapters, refetch, onUnlocked, logDuplicatePrevented]);

  const handleAdReward = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleModalChapterUnlocked = useCallback((trackId: string) => {
    setUnlockedChapters(prev => new Set(prev).add(trackId));
    refetch();
    onUnlocked();
  }, [refetch, onUnlocked]);

  if (loading || !coinEnabled) return null;
  if (tracks.length === 0) return null;
  if (hasFullUnlock) return null;

  const lockedTracks = nonPreviewTracks.filter(t => !unlockedChapters.has(t.id));
  if (lockedTracks.length === 0) return null;

  const { cost: adjustedFullCost, remainingIndividual } = calcFullUnlockCost(nonPreviewTracks, unlockedChapters);
  const savingsAmount = remainingIndividual - adjustedFullCost;
  const savingsPercent = remainingIndividual > 0 ? Math.round((savingsAmount / remainingIndividual) * 100) : 0;
  const canAffordFull = wallet.balance >= adjustedFullCost;

  return (
    <>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Unlock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">চ্যাপ্টার আনলক করুন</p>
                <p className="text-xs text-muted-foreground">
                  অ্যাড দেখে কয়েন আয় করুন, তারপর আনলক করুন
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              {lockedTracks.length} লক
            </Badge>
          </div>

          {/* Info bar */}
          <div className="text-xs text-muted-foreground flex items-center gap-4 pb-1 border-b border-border">
            <span className="flex items-center gap-1"><Tv className="w-3 h-3" /> ১ অ্যাড = {adCoinReward} কয়েন</span>
            <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> ক্রমানুসারে আনলক</span>
            <span className="text-muted-foreground/60">ব্যালেন্স: {wallet.balance}</span>
          </div>

          {/* Watch Ad to earn coins */}
          <WatchAdButton
            placement={`audiobook_${bookId}`}
            onRewardEarned={handleAdReward}
          />

          {/* Full audiobook coin unlock */}
          {lockedTracks.length > 1 && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">সম্পূর্ণ অডিওবুক আনলক</p>
                    <p className="text-xs text-muted-foreground">
                      {lockedTracks.length} চ্যাপ্টার + ভবিষ্যৎ —{" "}
                      <span className="line-through">{remainingIndividual}</span>{" "}
                      <span className="text-primary font-bold">{adjustedFullCost} কয়েন</span>
                      {savingsPercent > 0 && (
                        <Badge className="ml-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                          {savingsPercent}% সেভ
                        </Badge>
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 flex-shrink-0"
                  disabled={fullUnlocking || !canAffordFull}
                  onClick={handleFullCoinUnlock}
                >
                  {fullUnlocking ? (
                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                  ) : (
                    <Coins className="w-4 h-4" />
                  )}
                  {fullUnlocking ? "আনলক হচ্ছে..." : `${adjustedFullCost} কয়েন`}
                </Button>
              </div>
              {!canAffordFull && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3 h-3" /> আরো {adjustedFullCost - wallet.balance} কয়েন প্রয়োজন —{" "}
                  <Link to="/coin-store" className="text-primary underline">কয়েন কিনুন</Link>
                </p>
              )}
            </div>
          )}

          {/* Per-chapter unlock list — now opens modal on click */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {lockedTracks.slice(0, 5).map((track, idx) => {
              const unlockable = isChapterUnlockable(track, idx);
              const adsNeeded = Math.ceil(track.chapterPrice / adCoinReward);

              return (
                <div
                  key={track.id}
                  className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-background/50 ${unlockable ? "cursor-pointer hover:bg-background/80 transition-colors" : "opacity-60"}`}
                  onClick={() => unlockable && setModalTrack(track)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{track.title}</span>
                      {track.duration && <span className="text-xs text-muted-foreground flex-shrink-0">{track.duration}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-5.5">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <Tv className="w-3 h-3" /> {adsNeeded} অ্যাড
                      </span>
                      <span className="text-[11px] text-muted-foreground">≈</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <Coins className="w-3 h-3" /> {track.chapterPrice} কয়েন
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {!unlockable ? (
                      <Button size="sm" className="text-xs gap-1 h-7 px-2" disabled>
                        <AlertCircle className="w-3 h-3" /> ক্রম
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs gap-1 h-7 px-2">
                        <Unlock className="w-3 h-3" /> আনলক
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {lockedTracks.length > 5 && (
              <p className="text-xs text-center text-muted-foreground pt-1">
                +{lockedTracks.length - 5} আরো চ্যাপ্টার
              </p>
            )}
          </div>

          {/* Cash purchase CTA */}
          <Button size="sm" variant="ghost" className="w-full text-xs gap-1 text-muted-foreground" asChild>
            <Link to={`/checkout?book_id=${bookId}&format=audiobook`}>
              <ShoppingCart className="w-3 h-3" /> সম্পূর্ণ অডিওবুক কিনুন — ৳{audiobookPrice}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Quick Unlock Modal */}
      <QuickUnlockModal
        open={!!modalTrack}
        onOpenChange={(open) => { if (!open) setModalTrack(null); }}
        track={modalTrack}
        bookId={bookId}
        audiobookPrice={audiobookPrice}
        fullUnlockCost={adjustedFullCost}
        fullUnlockSavingsPercent={savingsPercent}
        remainingIndividualCost={remainingIndividual}
        lockedCount={lockedTracks.length}
        onChapterUnlocked={handleModalChapterUnlocked}
        onFullUnlock={handleFullCoinUnlock}
      />
    </>
  );
}
