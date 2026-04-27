import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign, Wallet, ArrowUpRight, Clock, TrendingUp,
  BookOpen, Headphones, Package,
} from "lucide-react";
import { toast } from "sonner";

interface EarningsDashboardProps {
  role: "writer" | "publisher" | "narrator";
}

export function EarningsDashboard({ role }: EarningsDashboardProps) {
  const utils = trpc.useUtils();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ amount: "", method: "bkash", account_info: "" });

  const { data: earnings = [] } = trpc.profiles.myEarnings.useQuery({ role });
  const { data: withdrawals = [] } = trpc.profiles.myWithdrawals.useQuery();
  const { data: minWithdrawalStr } = trpc.profiles.platformSetting.useQuery({ key: "minimum_withdrawal_amount" });
  const minWithdrawal = Number(minWithdrawalStr) || 500;

  const requestMutation = trpc.profiles.requestWithdrawal.useMutation({
    onSuccess: () => {
      utils.profiles.myWithdrawals.invalidate();
      toast.success("Withdrawal request submitted");
      setWithdrawOpen(false);
      setWithdrawForm({ amount: "", method: "bkash", account_info: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const totalEarned = earnings.reduce((sum, e) => sum + e.earned_amount, 0);
  const pendingEarnings = earnings.filter(e => e.status === "pending").reduce((sum, e) => sum + e.earned_amount, 0);
  const confirmedEarnings = earnings.filter(e => e.status === "confirmed").reduce((sum, e) => sum + e.earned_amount, 0);
  const totalWithdrawn = withdrawals.filter(w => w.status === "paid").reduce((sum, w) => sum + w.amount, 0);
  const pendingWithdrawals = withdrawals
    .filter(w => w.status === "pending" || w.status === "approved")
    .reduce((sum, w) => sum + w.amount, 0);
  const availableBalance = confirmedEarnings - totalWithdrawn - pendingWithdrawals;

  const ebookEarnings = earnings.filter(e => e.format === "ebook").reduce((s, e) => s + e.earned_amount, 0);
  const audioEarnings = earnings.filter(e => e.format === "audiobook").reduce((s, e) => s + e.earned_amount, 0);
  const hardcopyEarnings = earnings.filter(e => e.format === "hardcopy").reduce((s, e) => s + e.earned_amount, 0);
  const ebookSales = earnings.filter(e => e.format === "ebook").length;
  const audioSales = earnings.filter(e => e.format === "audiobook").length;
  const hardcopySales = earnings.filter(e => e.format === "hardcopy").length;

  const submitWithdrawal = () => {
    const amount = Number(withdrawForm.amount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (amount < minWithdrawal) { toast.error(`Minimum withdrawal is ৳${minWithdrawal}`); return; }
    if (amount > availableBalance) { toast.error("Insufficient balance"); return; }
    if (!withdrawForm.account_info.trim()) { toast.error("Enter account info"); return; }
    requestMutation.mutate({ amount, method: withdrawForm.method as "bkash" | "nagad" | "bank", accountInfo: withdrawForm.account_info, role });
  };

  const statusBadge = (status: string) => {
    const config: Record<string, string> = {
      pending: "bg-yellow-500/20 text-yellow-400",
      confirmed: "bg-emerald-500/20 text-emerald-400",
      approved: "bg-blue-500/20 text-blue-400",
      paid: "bg-emerald-500/20 text-emerald-400",
      rejected: "bg-destructive/20 text-destructive",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${config[status] || ""}`}>{status}</Badge>;
  };

  const roleStats = () => {
    if (role === "writer") return [
      { label: "eBook Sales", value: ebookSales, icon: BookOpen, color: "text-primary" },
      { label: "Audiobook Sales", value: audioSales, icon: Headphones, color: "text-blue-400" },
      { label: "Hardcopy Sales", value: hardcopySales, icon: Package, color: "text-purple-400" },
    ];
    if (role === "publisher") return [
      { label: "eBook Revenue", value: `৳${ebookEarnings.toFixed(0)}`, icon: BookOpen, color: "text-primary" },
      { label: "Audiobook Revenue", value: `৳${audioEarnings.toFixed(0)}`, icon: Headphones, color: "text-blue-400" },
      { label: "Hardcopy Revenue", value: `৳${hardcopyEarnings.toFixed(0)}`, icon: Package, color: "text-purple-400" },
    ];
    return [
      { label: "Audiobook Sales", value: audioSales, icon: Headphones, color: "text-blue-400" },
      { label: "Audiobook Revenue", value: `৳${audioEarnings.toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
    ];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-serif font-bold">Earnings</h1>
        <Button onClick={() => setWithdrawOpen(true)} disabled={availableBalance < minWithdrawal}>
          <Wallet className="h-4 w-4 mr-2" /> Request Withdrawal
        </Button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Earned", value: `৳${totalEarned.toFixed(0)}`, icon: TrendingUp, color: "text-primary" },
          { label: "Available Balance", value: `৳${Math.max(0, availableBalance).toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
          { label: "Pending Earnings", value: `৳${pendingEarnings.toFixed(0)}`, icon: Clock, color: "text-yellow-400" },
          { label: "Total Withdrawn", value: `৳${totalWithdrawn.toFixed(0)}`, icon: ArrowUpRight, color: "text-blue-400" },
        ].map(s => (
          <Card key={s.label} className="border-border/30 bg-card/60">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-secondary ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Format-wise Stats */}
      <div className={`grid grid-cols-1 sm:grid-cols-${role === "narrator" ? "2" : "3"} gap-4`}>
        {roleStats().map(s => (
          <Card key={s.label} className="border-border/30 bg-card/60">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending Payout */}
      {pendingWithdrawals > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="text-sm font-medium">Pending Payout</p>
                <p className="text-xs text-muted-foreground">Withdrawal requests being processed</p>
              </div>
            </div>
            <span className="text-lg font-bold text-yellow-400">৳{pendingWithdrawals.toFixed(0)}</span>
          </CardContent>
        </Card>
      )}

      {/* Earnings History */}
      <Card className="border-border/30 bg-card/60">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /> Earnings History</CardTitle></CardHeader>
        <CardContent>
          {earnings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Sale</TableHead>
                  <TableHead>Your %</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium max-w-[120px] truncate">{e.book_title || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{e.format}</Badge></TableCell>
                    <TableCell>৳{e.sale_amount}</TableCell>
                    <TableCell>{e.percentage}%</TableCell>
                    <TableCell className="font-semibold text-emerald-400">৳{e.earned_amount}</TableCell>
                    <TableCell>{statusBadge(e.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No earnings yet. Earnings appear when your content generates sales.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal History */}
      <Card className="border-border/30 bg-card/60">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4 text-blue-400" /> Payout History</CardTitle></CardHeader>
        <CardContent>
          {withdrawals.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map(w => (
                  <TableRow key={w.id}>
                    <TableCell className="font-semibold">৳{w.amount}</TableCell>
                    <TableCell className="capitalize">{w.method}</TableCell>
                    <TableCell>{statusBadge(w.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{w.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No payouts yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Withdrawal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-sm space-y-1">
              <div>Available: <span className="font-bold text-emerald-400">৳{Math.max(0, availableBalance).toFixed(0)}</span></div>
              <div className="text-xs text-muted-foreground">Minimum: ৳{minWithdrawal}</div>
            </div>
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                placeholder={`Min ৳${minWithdrawal}`} min={minWithdrawal} max={availableBalance} />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={withdrawForm.method} onValueChange={(v) => setWithdrawForm({ ...withdrawForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account / Number</Label>
              <Textarea value={withdrawForm.account_info} onChange={(e) => setWithdrawForm({ ...withdrawForm, account_info: e.target.value })}
                placeholder="bKash/Nagad number or bank account details" rows={2} />
            </div>
            <Button className="w-full" onClick={submitWithdrawal} disabled={requestMutation.isPending}>
              {requestMutation.isPending ? "Submitting..." : "Submit Payout Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
