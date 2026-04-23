import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Unlock, Lock, CheckCircle, Crown } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  bookId: string;
  format: "ebook" | "audiobook";
  price: number;
  coinPrice?: number | null; // explicit coin_price from book/format
}

export function CoinUnlockButton({ bookId, format, price, coinPrice }: Props) {
  const { user } = useAuth();
  const { wallet, unlockWithCoins } = useWallet();
  const [unlocking, setUnlocking] = useState(false);

  const { data: settings, isLoading: settingsLoading } = trpc.wallet.coinSettings.useQuery(undefined, { enabled: !!user });
  const { data: unlockData, isLoading: unlockLoading } = trpc.wallet.checkUnlock.useQuery(
    { bookId, format },
    { enabled: !!user }
  );
  const { data: subData, isLoading: subLoading } = trpc.wallet.hasSubscription.useQuery(
    { format },
    { enabled: !!user }
  );

  const loading = settingsLoading || unlockLoading || subLoading;
  const utils = trpc.useUtils();
  const coinEnabled = settings ? settings.systemEnabled && settings.unlockEnabled : false;
  const coinCost = coinPrice != null && coinPrice > 0
    ? coinPrice
    : settings ? Math.ceil(price / settings.conversionRatio) : 0;
  const isUnlocked = unlockData?.unlocked ?? false;
  const hasSubscription = subData?.hasSub ?? false;

  // Coin unlock is disabled for ebooks — only audiobooks support coin/ad unlock
  if (format === "ebook") return null;
  if (loading || !coinEnabled || price === 0) return null;

  // User has subscription — no need for coin unlock
  if (hasSubscription) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <Crown className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-primary">সাবস্ক্রিপশন অ্যাক্সেস</p>
            <p className="text-xs text-muted-foreground">আপনার সাবস্ক্রিপশনে এই কন্টেন্ট অন্তর্ভুক্ত</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isUnlocked) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-emerald-400">কয়েন দিয়ে আনলক করা হয়েছে</p>
            <p className="text-xs text-muted-foreground">এই কন্টেন্ট আপনার জন্য উন্মুক্ত</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium">{coinCost} কয়েন দিয়ে আনলক করুন</p>
                <p className="text-xs text-muted-foreground">অথবা সাবস্ক্রিপশন নিন</p>
              </div>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/auth">সাইন ইন</Link>
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="w-full text-xs gap-1" asChild>
            <Link to="/subscriptions"><Crown className="w-3 h-3" /> সাবস্ক্রিপশন দেখুন</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canAfford = wallet.balance >= coinCost;

  const handleUnlock = async () => {
    setUnlocking(true);
    const success = await unlockWithCoins(bookId, format, coinCost);
    if (success) utils.wallet.checkUnlock.invalidate({ bookId, format });
    setUnlocking(false);
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">কয়েন দিয়ে আনলক</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge className="bg-primary/20 text-primary text-xs">{coinCost} কয়েন</Badge>
                <span className="text-[11px] text-muted-foreground">
                  ব্যালেন্স: {wallet.balance}
                </span>
              </div>
            </div>
          </div>
          {canAfford ? (
            <Button
              size="sm"
              onClick={handleUnlock}
              disabled={unlocking}
              className="gap-1.5"
            >
              {unlocking ? (
                <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              {unlocking ? "আনলক হচ্ছে..." : "আনলক"}
            </Button>
          ) : (
            <div className="text-right">
              <p className="text-xs text-red-400 flex items-center gap-1 mb-1">
                <Lock className="w-3 h-3" /> অপর্যাপ্ত কয়েন
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link to="/rewards" className="text-xs">কয়েন অর্জন</Link>
              </Button>
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" className="w-full text-xs gap-1 text-muted-foreground" asChild>
          <Link to="/subscriptions"><Crown className="w-3 h-3" /> অথবা সাবস্ক্রিপশন নিন — ৳৯৯ থেকে</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
