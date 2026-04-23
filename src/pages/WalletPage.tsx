import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Coins, TrendingUp, TrendingDown, Wallet, Gift,
  BookOpen, CheckCircle
} from "lucide-react";
import { Link } from "react-router-dom";

export default function WalletPage() {
  const { user } = useAuth();
  const { wallet, transactions, loading } = useWallet();
  const [filterType, setFilterType] = useState("all");

  const { data: unlocks = [] } = trpc.wallet.userUnlocksWithBooks.useQuery(undefined, { enabled: !!user });
  const { data: settings } = trpc.wallet.coinSettings.useQuery(undefined, { enabled: !!user });
  const conversionRatio = settings?.conversionRatio ?? 1;

  if (!user) return null;

  const filteredTxs = filterType === "all"
    ? transactions
    : transactions.filter(t => t.type === filterType);

  const typeBadge = (type: string) => {
    const styles: Record<string, string> = {
      earn: "bg-emerald-500/20 text-emerald-400",
      spend: "bg-red-500/20 text-red-400",
      bonus: "bg-blue-500/20 text-blue-400",
      adjustment: "bg-amber-500/20 text-amber-400",
      refund: "bg-purple-500/20 text-purple-400",
    };
    const labels: Record<string, string> = {
      earn: "অর্জন", spend: "খরচ", bonus: "বোনাস", adjustment: "সমন্বয়", refund: "ফেরত",
    };
    return <Badge className={styles[type] || "bg-secondary text-foreground"}>{labels[type] || type}</Badge>;
  };

  const bdtValue = (wallet.balance * conversionRatio).toFixed(2);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-8 max-w-4xl">
        <h1 className="text-2xl font-serif font-bold mb-6 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" /> মাই ওয়ালেট
        </h1>

        {/* Balance Card */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Coins className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">মোট ব্যালেন্স</p>
                  <p className="text-4xl font-bold text-primary">{loading ? "—" : wallet.balance}</p>
                  <p className="text-xs text-muted-foreground">≈ ৳{bdtValue} BDT</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild className="gap-2">
                  <Link to="/coin-store"><Coins className="w-4 h-4" /> কয়েন কিনুন</Link>
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/rewards"><Gift className="w-4 h-4" /> কয়েন অর্জন করুন</Link>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-background/50 border border-border/30">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs text-muted-foreground">মোট অর্জিত</p>
                </div>
                <p className="text-2xl font-bold text-emerald-400">{wallet.totalEarned}</p>
              </div>
              <div className="p-4 rounded-xl bg-background/50 border border-border/30">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <p className="text-xs text-muted-foreground">মোট খরচ</p>
                </div>
                <p className="text-2xl font-bold text-red-400">{wallet.totalSpent}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="transactions">
          <TabsList className="w-full">
            <TabsTrigger value="transactions" className="flex-1">লেনদেন</TabsTrigger>
            <TabsTrigger value="unlocks" className="flex-1">আনলক করা কন্টেন্ট</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4 mt-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সব ধরন</SelectItem>
                <SelectItem value="earn">অর্জন</SelectItem>
                <SelectItem value="spend">খরচ</SelectItem>
                <SelectItem value="bonus">বোনাস</SelectItem>
                <SelectItem value="refund">ফেরত</SelectItem>
              </SelectContent>
            </Select>

            {filteredTxs.length === 0 ? (
              <Card className="border-border/30">
                <CardContent className="p-8 text-center text-muted-foreground">
                  কোনো লেনদেন নেই
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredTxs.map(tx => (
                  <Card key={tx.id} className="border-border/30">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          tx.amount > 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                        }`}>
                          {tx.amount > 0 ? (
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{tx.description || tx.type}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {typeBadge(tx.type)}
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(tx.created_at).toLocaleString("bn-BD")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className={`text-lg font-bold ${tx.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="unlocks" className="space-y-3 mt-4">
            {unlocks.length === 0 ? (
              <Card className="border-border/30">
                <CardContent className="p-8 text-center text-muted-foreground">
                  কোনো আনলক করা কন্টেন্ট নেই
                </CardContent>
              </Card>
            ) : (
              (unlocks as any[]).map((u: any) => (
                <Card key={u.id} className="border-border/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    {u.book?.cover_url ? (
                      <img src={u.book.cover_url} alt="" className="w-12 h-16 rounded object-cover" />
                    ) : (
                      <div className="w-12 h-16 rounded bg-secondary/60 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.book?.title || "Unknown"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="text-[10px]" variant="secondary">
                          {u.format === "ebook" ? "ইবুক" : u.format === "audiobook" ? "অডিওবুক" : u.format}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Coins className="w-3 h-3" /> {u.coins_spent} কয়েন
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(u.created_at).toLocaleDateString("bn-BD")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
