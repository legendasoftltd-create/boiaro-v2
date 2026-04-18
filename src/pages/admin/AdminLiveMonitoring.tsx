import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Activity, CreditCard, Coins, Unlock, BarChart3, AlertTriangle,
  Heart, RefreshCw, TrendingUp, ShieldAlert, CheckCircle2, XCircle,
  Clock, AlertOctagon,
} from "lucide-react";
import { isVerifiedRevenueOrder, type RevenueOrder } from "@/hooks/useUnifiedRevenue";

/* ─────── helpers ─────── */
type TimeRange = "today" | "7d" | "30d";

function getDateFrom(range: TimeRange): string {
  const d = new Date();
  if (range === "today") return d.toISOString().slice(0, 10);
  if (range === "7d") { d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
  d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
}

function pct(n: number, d: number) { return d === 0 ? 0 : Math.round((n / d) * 100); }
function fmtDate(s: string) { return new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

/* ─────── Health badge ─────── */
function HealthBadge({ ok, label, count }: { ok: boolean; label: string; count?: number }) {
  return (
    <Card className="border-border/30">
      <CardContent className="p-3 flex items-center gap-3">
        {ok ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-destructive shrink-0 animate-pulse" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className={`text-xs ${ok ? "text-green-500" : "text-destructive"}`}>
            {ok ? "OK" : `Warning${count ? ` (${count})` : ""}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────── Stat card ─────── */
function Stat({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: React.ElementType; accent?: string }) {
  return (
    <Card className="border-border/30">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted/50 ${accent || "text-primary"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════ */
export default function AdminLiveMonitoring() {
  const [range, setRange] = useState<TimeRange>("today");
  const [formatFilter, setFormatFilter] = useState("all");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [bookIdFilter, setBookIdFilter] = useState("");

  const dateFrom = getDateFrom(range);

  /* ─── QUERIES (parallel) ─── */
  const { data: payments, isLoading: loadP } = useQuery({
    queryKey: ["mon-payments", dateFrom],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("id,order_id,status,amount,method,created_at").gte("created_at", dateFrom).order("created_at", { ascending: false }).limit(500);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: paymentEvents } = useQuery({
    queryKey: ["mon-payment-events", dateFrom],
    queryFn: async () => {
      const { data } = await supabase.from("payment_events").select("*").gte("created_at", dateFrom).order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: coinTx } = useQuery({
    queryKey: ["mon-coins", dateFrom],
    queryFn: async () => {
      const { data } = await supabase.from("coin_transactions").select("*").gte("created_at", dateFrom).order("created_at", { ascending: false }).limit(500);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: unlocks } = useQuery({
    queryKey: ["mon-unlocks", dateFrom, formatFilter],
    queryFn: async () => {
      let q = supabase.from("content_unlocks").select("*").gte("created_at", dateFrom).order("created_at", { ascending: false }).limit(500);
      if (formatFilter !== "all") q = q.eq("format", formatFilter);
      const { data } = await q;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: orders } = useQuery({
    queryKey: ["mon-orders", dateFrom],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id,status,total_amount,payment_method,cod_payment_status,created_at,shipping_cost").gte("created_at", dateFrom).order("created_at", { ascending: false }).limit(1000);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: orderItems } = useQuery({
    queryKey: ["mon-order-items", dateFrom],
    queryFn: async () => {
      const { data } = await supabase.from("order_items").select("order_id,format,quantity,unit_price").limit(1000);
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const { data: ledger } = useQuery({
    queryKey: ["mon-ledger", dateFrom],
    queryFn: async () => {
      const { data } = await supabase.from("accounting_ledger").select("id,order_id,type,category,amount,entry_date").gte("entry_date", dateFrom).limit(1000);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: sysLogs } = useQuery({
    queryKey: ["mon-syslogs", dateFrom],
    queryFn: async () => {
      const { data } = await supabase.from("system_logs").select("*").gte("created_at", dateFrom).order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  /* ─── DERIVED METRICS ─── */
  const paymentStats = useMemo(() => {
    if (!payments) return { total: 0, success: 0, failed: 0, pending: 0, rate: 0, recentFailed: [] as any[] };
    const success = payments.filter(p => p.status === "paid");
    const failed = payments.filter(p => p.status === "failed");
    const pending = payments.filter(p => p.status === "pending");
    return {
      total: payments.length,
      success: success.length,
      failed: failed.length,
      pending: pending.length,
      rate: pct(success.length, payments.length),
      recentFailed: failed.slice(0, 20),
    };
  }, [payments]);

  const coinStats = useMemo(() => {
    if (!coinTx) return { awarded: 0, spent: 0, adRewards: 0, bonusRewards: 0, recentEarn: [] as any[], recentSpend: [] as any[] };
    const earns = coinTx.filter(t => t.type === "earn");
    const spends = coinTx.filter(t => t.type === "spend");
    return {
      awarded: earns.reduce((s, t) => s + (t.amount || 0), 0),
      spent: spends.reduce((s, t) => s + Math.abs(t.amount || 0), 0),
      adRewards: earns.filter(t => t.source === "ad_reward").length,
      bonusRewards: earns.filter(t => t.source && t.source !== "ad_reward" && t.source !== "daily_login").length,
      recentEarn: earns.slice(0, 20),
      recentSpend: spends.slice(0, 20),
    };
  }, [coinTx]);

  const unlockStats = useMemo(() => {
    if (!unlocks) return { total: 0, chapters: 0, full: 0, success: 0, failed: 0, dupPrevented: 0 };
    const chap = unlocks.filter(u => u.unlock_method === "coin" || u.unlock_method === "ad_session");
    const full = unlocks.filter(u => u.unlock_method === "purchase");
    const success = unlocks.filter(u => u.status === "active");
    const failed = unlocks.filter(u => u.status === "failed");
    return {
      total: unlocks.length,
      chapters: chap.length,
      full: full.length,
      success: success.length,
      failed: failed.length,
      dupPrevented: 0,
    };
  }, [unlocks]);

  const revenueStats = useMemo(() => {
    if (!orders) return { todayRev: 0, totalRev: 0, ebookRev: 0, audioRev: 0, orderCount: 0, ledgerCount: 0, missingLedger: 0, dupLedger: 0 };
    const verified = orders.filter(o => isVerifiedRevenueOrder(o as RevenueOrder));
    const totalRev = verified.reduce((s, o) => s + ((o.total_amount || 0) - (o.shipping_cost || 0)), 0);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = verified.filter(o => o.created_at?.slice(0, 10) === todayStr);
    const todayRev = todayOrders.reduce((s, o) => s + ((o.total_amount || 0) - (o.shipping_cost || 0)), 0);

    // format split via order_items
    const itemsByOrder = new Map<string, any[]>();
    (orderItems || []).forEach(i => {
      const arr = itemsByOrder.get(i.order_id) || [];
      arr.push(i);
      itemsByOrder.set(i.order_id, arr);
    });
    let ebookRev = 0, audioRev = 0;
    verified.forEach(o => {
      const items = itemsByOrder.get(o.id) || [];
      items.forEach((i: any) => {
        const rev = (i.unit_price || 0) * (i.quantity || 1);
        if (i.format === "ebook") ebookRev += rev;
        else if (i.format === "audiobook") audioRev += rev;
      });
    });

    // ledger checks
    const verifiedIds = new Set(verified.map(o => o.id));
    const ledgerOrderIds = new Set((ledger || []).filter(l => l.type === "income" && l.category === "book_sale" && l.order_id).map(l => l.order_id));
    const missingLedger = [...verifiedIds].filter(id => !ledgerOrderIds.has(id)).length;

    // dup check
    const seen = new Set<string>();
    let dupLedger = 0;
    (ledger || []).filter(l => l.order_id && l.type === "income").forEach(l => {
      const k = `${l.order_id}_${l.category}`;
      if (seen.has(k)) dupLedger++;
      seen.add(k);
    });

    return { todayRev, totalRev, ebookRev, audioRev, orderCount: verified.length, ledgerCount: ledgerOrderIds.size, missingLedger, dupLedger };
  }, [orders, orderItems, ledger]);

  const errorStats = useMemo(() => {
    const errors = (sysLogs || []).filter(l => l.level === "error" || l.level === "critical");
    const fpMap = new Map<string, number>();
    errors.forEach(e => {
      if (e.fingerprint) fpMap.set(e.fingerprint, (fpMap.get(e.fingerprint) || 0) + (e.occurrence_count || 1));
    });
    const repeated = [...fpMap.entries()].filter(([, c]) => c > 2).sort((a, b) => b[1] - a[1]);
    return { total: errors.length, errors, repeated };
  }, [sysLogs]);

  // unlock-related system_logs
  const unlockFailLogs = useMemo(() => (sysLogs || []).filter(l => l.module === "unlock" && l.level === "error").slice(0, 20), [sysLogs]);
  const dupPreventLogs = useMemo(() => (sysLogs || []).filter(l => l.message?.toLowerCase().includes("duplicate") || l.module === "coin_reward").slice(0, 20), [sysLogs]);

  /* ─── HEALTH ─── */
  const paymentOk = paymentStats.rate >= 80 || paymentStats.total === 0;
  const coinOk = coinStats.awarded >= 0; // always ok unless anomaly
  const unlockOk = unlockStats.failed === 0;
  const revenueOk = revenueStats.missingLedger === 0 && revenueStats.dupLedger === 0;

  /* ─── ALERTS ─── */
  const alerts = useMemo(() => {
    const a: { type: "error" | "warning"; msg: string }[] = [];
    if (paymentStats.rate > 0 && paymentStats.rate < 80) a.push({ type: "error", msg: `Payment failure spike — success rate only ${paymentStats.rate}%` });
    if (unlockStats.failed > 3) a.push({ type: "warning", msg: `${unlockStats.failed} unlock failures detected` });
    if (revenueStats.missingLedger > 0) a.push({ type: "error", msg: `${revenueStats.missingLedger} verified orders missing ledger entries` });
    if (revenueStats.dupLedger > 0) a.push({ type: "warning", msg: `${revenueStats.dupLedger} duplicate ledger entries found` });
    if (errorStats.repeated.length > 0) a.push({ type: "warning", msg: `${errorStats.repeated.length} repeated error fingerprints` });
    return a;
  }, [paymentStats, unlockStats, revenueStats, errorStats]);

  const isLoading = loadP;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Live Monitoring
          </h1>
          <p className="text-sm text-muted-foreground">Production health dashboard — read-only</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => window.location.reload()}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* SECTION 7 — Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={range} onValueChange={v => setRange(v as TimeRange)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={formatFilter} onValueChange={setFormatFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="ebook">Ebook</SelectItem>
            <SelectItem value="audiobook">Audiobook</SelectItem>
            <SelectItem value="hardcopy">Hardcopy</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="User ID..." value={userIdFilter} onChange={e => setUserIdFilter(e.target.value)} className="w-[180px]" />
        <Input placeholder="Book ID..." value={bookIdFilter} onChange={e => setBookIdFilter(e.target.value)} className="w-[180px]" />
      </div>

      {/* SECTION 6 — Health Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <HealthBadge ok={paymentOk} label="Payments" count={paymentStats.failed} />
        <HealthBadge ok={coinOk} label="Coins" />
        <HealthBadge ok={unlockOk} label="Unlocks" count={unlockStats.failed} />
        <HealthBadge ok={revenueOk} label="Revenue Sync" count={revenueStats.missingLedger + revenueStats.dupLedger} />
        <HealthBadge ok={errorStats.total === 0} label="Errors" count={errorStats.total} />
      </div>

      {/* SECTION 8 — Alerts */}
      {alerts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-4 h-4" /> Active Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {a.type === "error" ? <AlertOctagon className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                <span className={a.type === "error" ? "text-destructive" : "text-amber-500"}>{a.msg}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabbed sections */}
      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="payments" className="gap-1.5 text-xs"><CreditCard className="w-3.5 h-3.5" />Payments</TabsTrigger>
          <TabsTrigger value="coins" className="gap-1.5 text-xs"><Coins className="w-3.5 h-3.5" />Coins</TabsTrigger>
          <TabsTrigger value="unlocks" className="gap-1.5 text-xs"><Unlock className="w-3.5 h-3.5" />Unlocks</TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1.5 text-xs"><BarChart3 className="w-3.5 h-3.5" />Revenue</TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5 text-xs"><AlertTriangle className="w-3.5 h-3.5" />Errors</TabsTrigger>
        </TabsList>

        {/* SECTION 1 — Payments */}
        <TabsContent value="payments" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total Attempts" value={paymentStats.total} icon={CreditCard} />
            <Stat label="Successful" value={paymentStats.success} icon={CheckCircle2} accent="text-green-500" />
            <Stat label="Failed" value={paymentStats.failed} icon={XCircle} accent="text-destructive" />
            <Stat label="Success Rate" value={`${paymentStats.rate}%`} icon={TrendingUp} accent={paymentStats.rate >= 80 ? "text-green-500" : "text-destructive"} />
          </div>
          <Stat label="Pending" value={paymentStats.pending} icon={Clock} accent="text-amber-500" />

          {paymentStats.recentFailed.length > 0 && (
            <Card className="border-border/30">
              <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Recent Failed Payments</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>ID</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Time</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {paymentStats.recentFailed.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.id?.slice(0, 8)}</TableCell>
                        <TableCell>৳{p.amount}</TableCell>
                        <TableCell>{p.method}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(p.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {(paymentEvents || []).length > 0 && (
            <Card className="border-border/30">
              <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Recent Payment Events (IPN/Webhook)</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Gateway</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Time</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(paymentEvents || []).slice(0, 30).map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{e.gateway}</TableCell>
                        <TableCell className="text-xs">{e.event_type}</TableCell>
                        <TableCell><Badge variant={e.status === "paid" ? "default" : "secondary"} className="text-[10px]">{e.status}</Badge></TableCell>
                        <TableCell>৳{e.amount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(e.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* SECTION 2 — Coins */}
        <TabsContent value="coins" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Coins Awarded" value={coinStats.awarded} icon={Coins} accent="text-green-500" />
            <Stat label="Coins Spent" value={coinStats.spent} icon={Coins} accent="text-destructive" />
            <Stat label="Ad Rewards" value={coinStats.adRewards} icon={Activity} />
            <Stat label="Bonus Rewards" value={coinStats.bonusRewards} icon={Heart} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-border/30">
              <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Recent Coin Awards</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Source</TableHead><TableHead>Desc</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {coinStats.recentEarn.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-green-500 font-semibold">+{t.amount}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{t.source || "—"}</Badge></TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{t.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="border-border/30">
              <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Recent Coin Deductions</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Source</TableHead><TableHead>Desc</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {coinStats.recentSpend.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-destructive font-semibold">{t.amount}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{t.source || "—"}</Badge></TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{t.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {dupPreventLogs.length > 0 && (
            <Card className="border-border/30">
              <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Duplicate Reward Prevention Logs</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Module</TableHead><TableHead>Message</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {dupPreventLogs.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.module}</TableCell>
                        <TableCell className="text-xs max-w-[250px] truncate">{l.message}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(l.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* SECTION 3 — Unlocks */}
        <TabsContent value="unlocks" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total Unlocks" value={unlockStats.total} icon={Unlock} />
            <Stat label="Chapter Unlocks" value={unlockStats.chapters} icon={Unlock} accent="text-primary" />
            <Stat label="Full Purchases" value={unlockStats.full} icon={CheckCircle2} accent="text-green-500" />
            <Stat label="Failed" value={unlockStats.failed} icon={XCircle} accent="text-destructive" />
          </div>

          {unlockFailLogs.length > 0 && (
            <Card className="border-border/30">
              <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Recent Unlock Failures</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Message</TableHead><TableHead>Fingerprint</TableHead><TableHead>Count</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {unlockFailLogs.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs max-w-[250px] truncate">{l.message}</TableCell>
                        <TableCell className="font-mono text-[10px]">{l.fingerprint?.slice(0, 12) || "—"}</TableCell>
                        <TableCell>{l.occurrence_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(l.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* SECTION 4 — Revenue */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Today Revenue" value={`৳${revenueStats.todayRev.toLocaleString()}`} icon={BarChart3} accent="text-green-500" />
            <Stat label={`${range === "today" ? "Today" : range} Revenue`} value={`৳${revenueStats.totalRev.toLocaleString()}`} icon={TrendingUp} />
            <Stat label="Ebook Revenue" value={`৳${revenueStats.ebookRev.toLocaleString()}`} icon={BarChart3} accent="text-primary" />
            <Stat label="Audiobook Revenue" value={`৳${revenueStats.audioRev.toLocaleString()}`} icon={BarChart3} accent="text-primary" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Verified Orders" value={revenueStats.orderCount} icon={CheckCircle2} />
            <Stat label="Ledger Entries" value={revenueStats.ledgerCount} icon={BarChart3} />
            <Stat label="Missing Ledger" value={revenueStats.missingLedger} icon={revenueStats.missingLedger > 0 ? AlertTriangle : CheckCircle2} accent={revenueStats.missingLedger > 0 ? "text-destructive" : "text-green-500"} />
            <Stat label="Duplicate Ledger" value={revenueStats.dupLedger} icon={revenueStats.dupLedger > 0 ? AlertTriangle : CheckCircle2} accent={revenueStats.dupLedger > 0 ? "text-amber-500" : "text-green-500"} />
          </div>
        </TabsContent>

        {/* SECTION 5 — Errors */}
        <TabsContent value="errors" className="space-y-4">
          <Stat label="Total Errors" value={errorStats.total} icon={AlertOctagon} accent="text-destructive" />

          {errorStats.repeated.length > 0 && (
            <Card className="border-border/30">
              <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Repeated Errors (by fingerprint)</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Fingerprint</TableHead><TableHead>Count</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {errorStats.repeated.slice(0, 15).map(([fp, count]) => (
                      <TableRow key={fp}>
                        <TableCell className="font-mono text-xs">{fp}</TableCell>
                        <TableCell><Badge variant="destructive" className="text-[10px]">×{count}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          <Card className="border-border/30">
            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Recent System Errors</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Module</TableHead><TableHead>Message</TableHead><TableHead>Count</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                <TableBody>
                  {errorStats.errors.slice(0, 30).map((l: any) => (
                    <TableRow key={l.id} className={l.level === "critical" ? "bg-destructive/5" : ""}>
                      <TableCell><Badge variant="destructive" className="text-[10px]">{l.level}</Badge></TableCell>
                      <TableCell className="text-xs">{l.module}</TableCell>
                      <TableCell className="text-xs max-w-[300px] truncate">{l.message}</TableCell>
                      <TableCell>{l.occurrence_count > 1 ? `×${l.occurrence_count}` : ""}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(l.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {errorStats.errors.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No errors — system healthy ✓</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
