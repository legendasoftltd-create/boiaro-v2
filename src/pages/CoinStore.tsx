import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useWallet } from "@/hooks/useWallet";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, Sparkles, ShieldCheck, Zap, Loader2, Crown, Gift, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function CoinStore() {
  const { user } = useAuth();
  const { wallet } = useWallet();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const { data: packages = [], isLoading } = trpc.wallet.coinPackages.useQuery();
  const initiatePurchaseMutation = trpc.wallet.initiateCoinPurchase.useMutation();

  const handlePurchase = async (pkg: any) => {
    if (!user) { toast.error("Please sign in first"); return; }
    setPurchasing(pkg.id);
    try {
      const result = await initiatePurchaseMutation.mutateAsync({ packageId: pkg.id });
      if (result.gateway_url) {
        window.location.href = result.gateway_url;
      } else {
        toast.info("Payment gateway integration coming soon. Purchase recorded.");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not initiate payment");
    }
    setPurchasing(null);
  };

  const totalCoins = (pkg: any) => pkg.coins + pkg.bonus_coins;
  const perCoinCost = (pkg: any) => (pkg.price / totalCoins(pkg)).toFixed(3);

  const baseCostPerCoin = (packages as any[]).length > 0 ? (packages as any[])[0].price / totalCoins((packages as any[])[0]) : 0;
  const savingsPercent = (pkg: any) => {
    if (!baseCostPerCoin) return 0;
    const thisCost = pkg.price / totalCoins(pkg);
    return Math.round(((baseCostPerCoin - thisCost) / baseCostPerCoin) * 100);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Coins className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold mb-2">Get More Coins</h1>
          <p className="text-muted-foreground text-sm">Unlock premium content instantly with coins</p>
          {user && (
            <div className="mt-3 inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5">
              <Coins className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Balance: <span className="text-primary font-bold">{wallet.balance}</span> coins</span>
            </div>
          )}
        </div>

        {/* Packages */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (packages as any[]).length === 0 ? (
          <Card className="border-border/30">
            <CardContent className="p-12 text-center text-muted-foreground">
              No packages available
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {(packages as any[]).map((pkg: any) => {
              const savings = savingsPercent(pkg);
              const bestValue = pkg.name === "Best Value";
              const featured = pkg.is_featured;

              return (
                <Card
                  key={pkg.id}
                  className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${
                    bestValue
                      ? "border-emerald-500/50 ring-2 ring-emerald-500/20 scale-[1.02]"
                      : featured
                        ? "border-primary/50 ring-2 ring-primary/20 scale-[1.02]"
                        : "border-border/30 hover:border-primary/30"
                  }`}
                >
                  {featured && (
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                      <Crown className="w-3 h-3" /> Most Popular
                    </div>
                  )}
                  {bestValue && !featured && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Best Value
                    </div>
                  )}
                  <CardContent className="p-6 text-center">
                    <div className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
                      bestValue ? "bg-emerald-500/20" : featured ? "bg-primary/20" : "bg-secondary"
                    }`}>
                      <Coins className={`w-7 h-7 ${bestValue ? "text-emerald-500" : featured ? "text-primary" : "text-muted-foreground"}`} />
                    </div>

                    <h3 className="font-bold text-lg mb-1">{pkg.name}</h3>

                    <div className="my-4">
                      <span className="text-4xl font-bold text-primary">{totalCoins(pkg).toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground ml-1">coins</span>
                    </div>

                    {pkg.bonus_coins > 0 && (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 mb-3">
                        <Gift className="w-3 h-3 mr-1" />
                        +{pkg.bonus_coins} bonus coins
                      </Badge>
                    )}

                    {savings > 0 && (
                      <div className="mb-3">
                        <Badge variant="secondary" className="text-xs">Save {savings}%</Badge>
                      </div>
                    )}

                    <div className="text-3xl font-bold mb-1">৳{pkg.price}</div>
                    <p className="text-xs text-muted-foreground mb-4">৳{perCoinCost(pkg)} per coin</p>

                    <Button
                      className="w-full gap-2"
                      size="lg"
                      variant={bestValue || featured ? "default" : "outline"}
                      onClick={() => handlePurchase(pkg)}
                      disabled={!!purchasing}
                    >
                      {purchasing === pkg.id ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                      ) : (
                        <><Zap className="w-4 h-4" /> Buy Now</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Trust badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
          {[
            { icon: ShieldCheck, title: "Secure Payment", desc: "Protected by SSLCommerz" },
            { icon: Zap, title: "Instant Credit", desc: "Coins added immediately after payment" },
            { icon: Sparkles, title: "Bonus Coins", desc: "Get extra coins on larger packages" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-3 p-4 rounded-xl bg-secondary/30 border border-border/30">
              <Icon className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link to="/wallet">
            <Button variant="ghost" className="gap-2 text-muted-foreground">
              <Coins className="w-4 h-4" /> View Wallet
            </Button>
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
