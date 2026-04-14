import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import SummaryCard from '@/components/admin/SummaryCard';

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
    const { data } = await supabase
      .from("user_coins" as any)
      .select("*, profiles(display_name, avatar_url)")
      .order("balance", { ascending: false })
      .limit(200);
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
    const { data } = await supabase
      .from("coin_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setTransactions((data as CoinTransaction[]) || []);
  };

  useEffect(() => { fetchWallets(); fetchTransactions(); }, []);

  const openDetail = async (w: UserWallet) => {
    setSelectedWallet(w);
    const { data } = await supabase
      .from("coin_transactions")
      .select("*")
      .eq("user_id", w.user_id)
      .order("created_at", { ascending: false })
      .limit(50);
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

    // Use secure RPC — admin role is validated server-side
    const { error: rpcErr } = await supabase.rpc("adjust_user_coins", {
      p_user_id: selectedWallet.user_id,
      p_amount: coinChange,
      p_type: txType,
      p_description: adjustReason || `Admin ${adjustType}: ${amt} coins`,
    });
    if (rpcErr) { toast.error(rpcErr.message); return; }

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
    { label: "Total Distributed", value: stats.totalDistributed, icon: TrendingUp, color: "#00A169" },
    { label: "Total Spent", value: stats.totalSpent, icon: TrendingDown, color: "#EF4444" },
    { label: "Total Users", value: stats.totalUsers, icon: Wallet, color: "#0037A1" },
    { label: "Avg Balance", value: stats.avgBalance, icon: Coins, color: "#00E21E" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-black">Wallet Management</h1>
        
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <SummaryCard
            key={s.label}
              icon={s.icon}
              title={s.label}
              value={s.value.toLocaleString()}
              color={s.color}
            />
        ))}
      </div>

      <Tabs defaultValue="wallets">
        <TabsList className="flex items-center justify-center gap-5 w-full"><TabsTrigger value="wallets">User Wallets</TabsTrigger><TabsTrigger value="transactions">All Transactions</TabsTrigger></TabsList>

        <TabsContent value="wallets" className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
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
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-black">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-black">No wallets found</TableCell></TableRow>
                ) : filtered.map(w => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{w.profiles?.display_name || "User"}</p>
                      <p className="text-[11px] text-black font-mono">{w.user_id.slice(0, 8)}...</p>
                    </TableCell>
                    <TableCell className="text-right font-bold text-black">{w.balance}</TableCell>
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
