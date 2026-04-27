import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Coins, TrendingUp, TrendingDown, Search, Plus, Minus, ArrowUpDown, Eye } from "lucide-react";
import { toast } from "sonner";

interface UserWallet {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
}

interface CoinTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

export default function AdminWallets() {
  const utils = trpc.useUtils();
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [search, setSearch] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<UserWallet | null>(null);
  const [userTxs, setUserTxs] = useState<CoinTransaction[]>([]);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"add" | "deduct">("add");
  const [adjustReason, setAdjustReason] = useState("");
  const [stats, setStats] = useState({ totalDistributed: 0, totalSpent: 0, totalUsers: 0, avgBalance: 0 });

  const fetchWallets = async () => {
    const data = await utils.admin.listWallets.fetch({ limit: 200 });
    const w = (data as any[] || []) as UserWallet[];
    setWallets(w);
    if (w.length > 0) {
      const totalDist = w.reduce((s, x) => s + x.total_earned, 0);
      const totalSp = w.reduce((s, x) => s + x.total_spent, 0);
      const avg = Math.round(w.reduce((s, x) => s + x.balance, 0) / w.length);
      setStats({ totalDistributed: totalDist, totalSpent: totalSp, totalUsers: w.length, avgBalance: avg });
    }
    setLoading(false);
  };

  const fetchTransactions = async () => {
    const data = await utils.admin.listCoinTransactions.fetch({ limit: 200 });
    setTransactions((data as CoinTransaction[]) || []);
  };

  useEffect(() => { fetchWallets(); fetchTransactions(); }, []);

  const openDetail = async (w: UserWallet) => {
    setSelectedWallet(w);
    const data = await utils.admin.listCoinTransactionsByUser.fetch({ userId: w.user_id, limit: 50 });
    setUserTxs((data as CoinTransaction[]) || []);
    setDetailOpen(true);
  };

  const handleAdjust = async () => {
    if (!selectedWallet || !adjustAmount) return;
    const amt = parseInt(adjustAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("Invalid amount"); return; }
    if (adjustType === "deduct" && amt > selectedWallet.balance) {
      toast.error("Insufficient balance"); return;
    }

    const coinChange = adjustType === "add" ? amt : -amt;
    const txType = adjustType === "add" ? "bonus" : "adjustment";

    await utils.admin.adjustUserCoins.fetch({
      userId: selectedWallet.user_id,
      amount: coinChange,
      type: txType,
      description: adjustReason || `Admin ${adjustType}: ${amt} coins`,
    });

    toast.success(`${adjustType === "add" ? "Added" : "Deducted"} ${amt} coins`);
    setAdjustOpen(false);
    setAdjustAmount("");
    setAdjustReason("");
    fetchWallets();
    fetchTransactions();
  };

  const filtered = wallets.filter(w =>
    !search || (w.profiles?.display_name || "").toLowerCase().includes(search.toLowerCase()) || w.user_id.includes(search)
  );

  const filteredTx = transactions.filter(t =>
    !txSearch || (t.description || "").toLowerCase().includes(txSearch.toLowerCase()) || t.type.includes(txSearch) || t.user_id.includes(txSearch)
  );

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      earn: "bg-emerald-500/20 text-emerald-400",
      purchase: "bg-emerald-500/20 text-emerald-400",
      spend: "bg-red-500/20 text-red-400",
      bonus: "bg-blue-500/20 text-blue-400",
      adjustment: "bg-amber-500/20 text-amber-400",
      refund: "bg-purple-500/20 text-purple-400",
    };
    return <Badge className={colors[type] || "bg-secondary text-foreground"}>{type}</Badge>;
  };

  const statCards = [
    { label: "Total Distributed", value: stats.totalDistributed, icon: TrendingUp, color: "text-emerald-400" },
    { label: "Total Spent", value: stats.totalSpent, icon: TrendingDown, color: "text-red-400" },
    { label: "Total Users", value: stats.totalUsers, icon: Wallet, color: "text-blue-400" },
    { label: "Avg Balance", value: stats.avgBalance, icon: Coins, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold">Wallet Management</h1>
        <p className="text-muted-foreground text-sm">Manage user wallets and coin transactions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <Card key={s.label} className="border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-secondary/60"><s.icon className={`w-5 h-5 ${s.color}`} /></div>
              <div>
                <p className="text-xl font-bold">{s.value.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="wallets">
        <TabsList><TabsTrigger value="wallets">User Wallets</TabsTrigger><TabsTrigger value="transactions">All Transactions</TabsTrigger></TabsList>

        <TabsContent value="wallets" className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or user ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          <Card className="border-border/30">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No wallets found</TableCell></TableRow>
                ) : filtered.map(w => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{w.profiles?.display_name || "User"}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{w.user_id.slice(0, 8)}...</p>
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">{w.balance}</TableCell>
                    <TableCell className="text-right text-emerald-400">{w.total_earned}</TableCell>
                    <TableCell className="text-right text-red-400">{w.total_spent}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(w)}><Eye className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedWallet(w); setAdjustOpen(true); }}><ArrowUpDown className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search transactions..." value={txSearch} onChange={e => setTxSearch(e.target.value)} className="pl-9" />
          </div>
          <Card className="border-border/30">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTx.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No transactions</TableCell></TableRow>
                ) : filteredTx.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-xs">{t.user_id.slice(0, 8)}...</TableCell>
                    <TableCell>{typeBadge(t.type)}</TableCell>
                    <TableCell className={`font-bold ${t.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{t.amount > 0 ? "+" : ""}{t.amount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.description || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Adjust Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Coins — {selectedWallet?.profiles?.display_name || "User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Current balance: <span className="font-bold text-primary">{selectedWallet?.balance}</span></p>
            <Select value={adjustType} onValueChange={(v: "add" | "deduct") => setAdjustType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="add"><Plus className="w-3 h-3 inline mr-1" />Add Coins</SelectItem>
                <SelectItem value="deduct"><Minus className="w-3 h-3 inline mr-1" />Deduct Coins</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Amount" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
            <Textarea placeholder="Reason / Note" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={handleAdjust}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Wallet: {selectedWallet?.profiles?.display_name || "User"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card className="border-border/30"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-primary">{selectedWallet?.balance}</p><p className="text-[10px] text-muted-foreground">Balance</p></CardContent></Card>
            <Card className="border-border/30"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-emerald-400">{selectedWallet?.total_earned}</p><p className="text-[10px] text-muted-foreground">Earned</p></CardContent></Card>
            <Card className="border-border/30"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-red-400">{selectedWallet?.total_spent}</p><p className="text-[10px] text-muted-foreground">Spent</p></CardContent></Card>
          </div>
          <p className="text-sm font-medium mb-2">Recent Transactions</p>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {userTxs.length === 0 ? <p className="text-sm text-muted-foreground">No transactions</p> : userTxs.map(t => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                <div>
                  {typeBadge(t.type)}
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description || "—"}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${t.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{t.amount > 0 ? "+" : ""}{t.amount}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
