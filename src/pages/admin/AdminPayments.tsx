import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, Search, CheckCircle2, XCircle, DollarSign, Clock, CreditCard, Banknote } from "lucide-react";
import { useAdminLogger } from "@/hooks/useAdminLogger";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  awaiting_payment: "bg-orange-500/20 text-orange-400",
  paid: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  refunded: "bg-blue-500/20 text-blue-400",
  cod_pending: "bg-amber-500/20 text-amber-400",
  cancelled: "bg-red-500/20 text-red-400",
};

export default function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { log } = useAdminLogger();

  const load = async () => {
    const { data } = await supabase
      .from("payments")
      .select("*, orders(id, order_number, shipping_name, shipping_phone, shipping_address, shipping_city, status, total_amount, payment_method, cod_payment_status, user_id)")
      .order("created_at", { ascending: false });

    // For payments without shipping_name (digital-only), fetch profile display names
    const missingNameUserIds = (data || [])
      .filter(p => !p.orders?.shipping_name && p.user_id)
      .map(p => p.user_id);
    const uniqueIds = [...new Set(missingNameUserIds)];
    let profileMap: Record<string, { display_name: string | null; phone: string | null }> = {};
    if (uniqueIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, phone")
        .in("user_id", uniqueIds);
      (profiles || []).forEach(p => { profileMap[p.user_id] = p; });
    }

    setPayments((data || []).map(p => ({
      ...p,
      _customerName: p.orders?.shipping_name || profileMap[p.user_id]?.display_name || p.user_id?.slice(0, 8) || "Unknown",
      _customerPhone: p.orders?.shipping_phone || profileMap[p.user_id]?.phone || null,
    })));
  };

  useEffect(() => { load(); }, []);

  const filtered = payments.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (methodFilter !== "all" && p.method !== methodFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (p._customerName || "").toLowerCase();
      const tid = p.transaction_id?.toLowerCase() || "";
      const orderNum = p.orders?.order_number?.toLowerCase() || "";
      if (!name.includes(q) && !tid.includes(q) && !p.id.toLowerCase().includes(q) && !orderNum.includes(q)) return false;
    }
    return true;
  });

  const totalPaid = payments.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = payments.filter(p => ["pending", "awaiting_payment", "cod_pending"].includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
  const totalFailed = payments.filter(p => p.status === "failed").reduce((s, p) => s + Number(p.amount), 0);
  const methods = [...new Set(payments.map(p => p.method).filter(Boolean))];

  const confirmCodPayment = async (payment: any) => {
    setConfirming(true);
    try {
      await supabase.from("payments").update({ status: "paid" } as any).eq("id", payment.id);
      await supabase.from("orders").update({ status: "confirmed" }).eq("id", payment.order_id);
      try {
        await supabase.functions.invoke("calculate-earnings", { body: { order_id: payment.order_id } });
      } catch (e) { console.error("Earnings calc failed:", e); }
      await log({ module: "payments", action: "COD payment confirmed", actionType: "approve", targetType: "payment", targetId: payment.id, details: `Confirmed payment ৳${payment.amount} for order ${payment.order_id?.slice(0, 8)}`, riskLevel: "high" });
      toast.success("Payment confirmed & earnings calculated");
      setSelected(null);
      load();
    } catch { toast.error("Failed to confirm"); }
    setConfirming(false);
  };

  const methodLabel = (m: string) => {
    const labels: Record<string, string> = { cod: "COD", sslcommerz: "SSLCommerz", bkash: "bKash", nagad: "Nagad", coin: "Coin", wallet: "Wallet", subscription: "Subscription" };
    return labels[m] || m;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold">Payments</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Collected</p>
              <p className="text-lg font-bold text-foreground">৳{totalPaid.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-bold text-foreground">৳{totalPending.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-lg font-bold text-foreground">৳{totalFailed.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Transactions</p>
              <p className="text-lg font-bold text-foreground">{payments.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Method Breakdown */}
      {methods.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {methods.map(m => {
            const count = payments.filter(p => p.method === m).length;
            const sum = payments.filter(p => p.method === m && p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
            return (
              <Badge key={m} variant="outline" className="px-3 py-1.5 text-xs gap-1.5">
                <Banknote className="w-3 h-3" />
                {methodLabel(m)}: {count} txn • ৳{sum.toLocaleString()}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, order, ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-secondary" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="awaiting_payment">Awaiting</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cod_pending">COD Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            {methods.map(m => <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transaction ID</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell className="text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-sm">{p._customerName || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{p.orders?.order_number || p.order_id?.slice(0, 8) || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{methodLabel(p.method)}</Badge>
                </TableCell>
                <TableCell className="font-medium">৳{Number(p.amount).toLocaleString()}</TableCell>
                <TableCell><Badge className={statusColors[p.status] || ""}>{p.status}</Badge></TableCell>
                <TableCell className="font-mono text-xs max-w-[120px] truncate">{p.transaction_id || "—"}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => setSelected(p)} className="h-7 w-7">
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payments found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Payment Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Payment ID</p>
                  <p className="font-mono text-xs">{selected.id.slice(0, 12)}...</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Date</p>
                  <p>{new Date(selected.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Customer</p>
                  <p className="font-medium">{selected._customerName || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Phone</p>
                  <p>{selected._customerPhone || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Method</p>
                  <p className="font-medium">{methodLabel(selected.method)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Amount</p>
                  <p className="font-bold text-primary text-lg">৳{Number(selected.amount).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge className={`${statusColors[selected.status] || ""} mt-0.5`}>{selected.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Transaction ID</p>
                  <p className="font-mono text-xs break-all">{selected.transaction_id || "—"}</p>
                </div>
                {selected.orders?.order_number && (
                  <div>
                    <p className="text-muted-foreground text-xs">Order Number</p>
                    <p className="font-mono text-sm">{selected.orders.order_number}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Order Status</p>
                  <p className="capitalize">{selected.orders?.status || "—"}</p>
                </div>
                {selected.method === "cod" && selected.orders?.cod_payment_status && (
                  <div>
                    <p className="text-muted-foreground text-xs">COD Settlement</p>
                    <Badge variant="outline" className="capitalize text-xs">{selected.orders.cod_payment_status}</Badge>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Order Total</p>
                  <p>৳{Number(selected.orders?.total_amount || 0).toLocaleString()}</p>
                </div>
                {selected.orders?.shipping_address && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Shipping Address</p>
                    <p className="text-xs">{selected.orders.shipping_address}, {selected.orders.shipping_city || ""}</p>
                  </div>
                )}
              </div>

              {(selected.status === "pending" || selected.status === "cod_pending") && selected.method === "cod" && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button onClick={() => confirmCodPayment(selected)} disabled={confirming} className="gap-2 flex-1">
                    <CheckCircle2 className="w-4 h-4" />
                    {confirming ? "Confirming..." : "Confirm COD Payment"}
                  </Button>
                  <Button variant="destructive" className="gap-2" onClick={async () => {
                    await supabase.from("payments").update({ status: "failed" } as any).eq("id", selected.id);
                    toast.success("Marked as failed");
                    setSelected(null);
                    load();
                  }}>
                    <XCircle className="w-4 h-4" /> Fail
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
