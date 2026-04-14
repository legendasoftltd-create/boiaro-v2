import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, Download, Printer,
  BookOpen, Users, ShoppingCart, BarChart3, Presentation,
  ArrowUpRight, ArrowDownRight, Banknote, Landmark, HandCoins, Receipt,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  isVerifiedRevenueOrder, isInPeriod, calculateNetRevenue, calculateTotalProfit, calculateOrderProfit, getItemBuyingCost,
  type RevenueOrder, type RevenuePeriod, type OrderItemWithCost,
} from "@/hooks/useUnifiedRevenue";
import { toast } from "sonner";
import SummaryCard from '@/components/admin/SummaryCard';


const COLORS = ["hsl(var(--primary))", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];
const chartTooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

export default function AdminInvestorReport() {
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [bookFormatCosts, setBookFormatCosts] = useState<any[]>([]);
  const [periodFilter, setPeriodFilter] = useState<RevenuePeriod>("all");
  const [presentationMode, setPresentationMode] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("orders").select("id, total_amount, status, created_at, packaging_cost, fulfillment_cost, shipping_cost, payment_method, cod_payment_status, user_id, purchase_cost_per_unit, is_purchased"),
      supabase.from("order_items").select("order_id, book_id, format, unit_price, quantity, books(title)"),
      supabase.from("accounting_ledger" as any).select("*").order("entry_date", { ascending: false }),
      supabase.from("contributor_earnings").select("book_id, format, role, earned_amount, sale_amount, status, created_at"),
      supabase.from("profiles").select("id, created_at").limit(1000),
      supabase.from("withdrawal_requests" as any).select("id, amount, status, created_at, payment_method").order("created_at", { ascending: false }),
      supabase.from("book_formats").select("book_id, format, unit_cost, original_price, publisher_commission_percent"),
    ]).then(([o, oi, l, e, p, w, bf]) => {
      setOrders(o.data || []);
      setOrderItems(oi.data || []);
      setLedger((l.data as any[]) || []);
      setEarnings(e.data || []);
      setProfiles(p.data || []);
      setWithdrawals((w.data as any[]) || []);
      setBookFormatCosts((bf.data as any[]) || []);
    });
  }, []);

  const filterByPeriod = (dateStr: string) => isInPeriod(dateStr, periodFilter);
  const paidOrders = useMemo(() => orders.filter(o => isVerifiedRevenueOrder(o as RevenueOrder) && filterByPeriod(o.created_at)), [orders, periodFilter]);
  const filteredLedger = useMemo(() => ledger.filter(e => filterByPeriod(e.entry_date)), [ledger, periodFilter]);

  // Build format cost lookup
  const formatCostMap = useMemo(() => {
    const map: Record<string, { unit_cost: number; original_price: number; publisher_commission_percent: number }> = {};
    bookFormatCosts.forEach((f: any) => {
      map[`${f.book_id}_${f.format}`] = {
        unit_cost: f.unit_cost || 0,
        original_price: f.original_price || 0,
        publisher_commission_percent: f.publisher_commission_percent || 0,
      };
    });
    return map;
  }, [bookFormatCosts]);

  const enrichedItems = useMemo(() => {
    const paidIds = new Set(paidOrders.map(o => o.id));
    return orderItems.filter(i => paidIds.has(i.order_id)).map(i => {
      const fc = formatCostMap[`${i.book_id}_${i.format}`] || { unit_cost: 0, original_price: 0, publisher_commission_percent: 0 };
      return {
        order_id: i.order_id, book_id: i.book_id, format: i.format,
        unit_price: i.unit_price || 0, quantity: i.quantity || 1,
        unit_cost: fc.unit_cost,
        original_price: fc.original_price,
        publisher_commission_percent: fc.publisher_commission_percent,
      };
    }) as OrderItemWithCost[];
  }, [paidOrders, orderItems, formatCostMap]);

  // ── Core KPIs ──
  const totalRevenue = calculateNetRevenue(paidOrders as RevenueOrder[]);
  const totalExpense = filteredLedger.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const totalBuyingCost = enrichedItems.reduce((s, i) => s + getItemBuyingCost(i) * i.quantity, 0);
  const totalPackaging = paidOrders.reduce((s, o) => s + (o.packaging_cost || 0), 0);
  const totalFulfillment = paidOrders.reduce((s, o) => s + (o.fulfillment_cost || 0), 0);
  const totalShipping = paidOrders.reduce((s, o) => s + (o.shipping_cost || 0), 0);
  const creatorPayouts = earnings.filter(e => e.role !== "platform" && e.status !== "reversed" && filterByPeriod(e.created_at))
    .reduce((s, e) => s + Number(e.earned_amount), 0);
  // Gross profit via unified logic (respects is_purchased + purchase_cost_per_unit)
  const grossProfit = calculateTotalProfit(paidOrders as RevenueOrder[], enrichedItems);
  const netProfit = grossProfit - creatorPayouts - totalExpense;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;
  const totalOrderCount = paidOrders.length;
  const avgOrderValue = totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0;
  const uniqueCustomers = new Set(paidOrders.map(o => o.user_id).filter(Boolean)).size;
  const totalUsers = profiles.length;

  // ── Format Revenue ──
  const formatData = useMemo(() => {
    const ids = new Set(paidOrders.map(o => o.id));
    const m: Record<string, number> = { ebook: 0, audiobook: 0, hardcopy: 0 };
    orderItems.filter(i => ids.has(i.order_id)).forEach(i => { if (m[i.format] !== undefined) m[i.format] += (i.unit_price || 0) * (i.quantity || 1); });
    return [{ name: "eBook", value: m.ebook }, { name: "Audiobook", value: m.audiobook }, { name: "Hard Copy", value: m.hardcopy }].filter(f => f.value > 0);
  }, [paidOrders, orderItems]);

  // ── Monthly Trend (with item-level profit) ──
  const monthlyTrend = useMemo(() => {
    // Build items-by-order map
    const itemsByOrder: Record<string, OrderItemWithCost[]> = {};
    enrichedItems.forEach(i => {
      if (!itemsByOrder[i.order_id]) itemsByOrder[i.order_id] = [];
      itemsByOrder[i.order_id].push(i);
    });

    const map: Record<string, { month: string; revenue: number; expense: number; profit: number; orders: number; users: number }> = {};
    paidOrders.forEach(o => {
      const m = o.created_at?.slice(0, 7); if (!m) return;
      if (!map[m]) map[m] = { month: m, revenue: 0, expense: 0, profit: 0, orders: 0, users: 0 };
      map[m].revenue += o.total_amount || 0;
      map[m].orders += 1;
      map[m].profit += calculateOrderProfit(o as RevenueOrder, itemsByOrder[o.id] || []);
    });
    filteredLedger.forEach(e => {
      const m = e.entry_date?.slice(0, 7); if (!m) return;
      if (!map[m]) map[m] = { month: m, revenue: 0, expense: 0, profit: 0, orders: 0, users: 0 };
      if (e.type === "expense") map[m].expense += Number(e.amount);
    });
    // User sign-ups by month
    profiles.forEach((p: any) => {
      if (!p.created_at) return;
      const m = p.created_at.slice(0, 7);
      if (map[m]) map[m].users += 1;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [paidOrders, filteredLedger, profiles, enrichedItems]);

  // ── Daily Growth (last 30 days) ──
  const dailyGrowth = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; orders: number; newUsers: number }> = {};
    const last30 = new Date(); last30.setDate(last30.getDate() - 30);
    paidOrders.forEach(o => {
      const d = o.created_at?.slice(0, 10); if (!d || d < last30.toISOString().slice(0, 10)) return;
      if (!map[d]) map[d] = { date: d, revenue: 0, orders: 0, newUsers: 0 };
      map[d].revenue += o.total_amount || 0;
      map[d].orders += 1;
    });
    profiles.forEach((p: any) => {
      const d = p.created_at?.slice(0, 10); if (!d || !map[d]) return;
      map[d].newUsers += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [paidOrders, profiles]);

  // ── Top Books ──
  const topBooks = useMemo(() => {
    const ids = new Set(paidOrders.map(o => o.id));
    const bm: Record<string, { title: string; revenue: number; qty: number }> = {};
    orderItems.filter(i => ids.has(i.order_id)).forEach(i => {
      if (!i.book_id) return;
      if (!bm[i.book_id]) bm[i.book_id] = { title: i.books?.title || "Unknown", revenue: 0, qty: 0 };
      bm[i.book_id].revenue += (i.unit_price || 0) * (i.quantity || 1);
      bm[i.book_id].qty += i.quantity || 1;
    });
    return Object.values(bm).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [paidOrders, orderItems]);

  // ── COD Cash Flow ──
  const codOrders = useMemo(() => orders.filter(o => o.payment_method === "cod" && filterByPeriod(o.created_at)), [orders, periodFilter]);
  const codPending = codOrders.filter(o => ["cod_pending_collection", "unpaid"].includes(o.cod_payment_status || ""))
    .reduce((s, o) => s + (o.total_amount || 0), 0);
  const codCollected = codOrders.filter(o => o.cod_payment_status === "collected_by_courier")
    .reduce((s, o) => s + (o.total_amount || 0), 0);
  const codSettled = codOrders.filter(o => ["settled_to_merchant", "paid"].includes(o.cod_payment_status || ""))
    .reduce((s, o) => s + (o.total_amount || 0), 0);

  // ── Cash Flow Summary ──
  const onlineInflow = paidOrders.filter(o => o.payment_method !== "cod").reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalInflow = onlineInflow + codSettled;
  const totalOutflow = creatorPayouts + totalExpense;
  const filteredWithdrawals = withdrawals.filter((w: any) => filterByPeriod(w.created_at));
  const paidWithdrawals = filteredWithdrawals.filter((w: any) => w.status === "completed").reduce((s: number, w: any) => s + Number(w.amount), 0);
  const pendingWithdrawals = filteredWithdrawals.filter((w: any) => w.status === "pending").reduce((s: number, w: any) => s + Number(w.amount), 0);

  // ── Growth Metrics ──
  const thisMonthOrders = orders.filter(o => isVerifiedRevenueOrder(o as RevenueOrder) && isInPeriod(o.created_at, "this_month"));
  const lastMonthOrders = orders.filter(o => isVerifiedRevenueOrder(o as RevenueOrder) && isInPeriod(o.created_at, "last_month"));
  const thisMonthRev = calculateNetRevenue(thisMonthOrders as RevenueOrder[]);
  const lastMonthRev = calculateNetRevenue(lastMonthOrders as RevenueOrder[]);
  const revenueGrowth = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : thisMonthRev > 0 ? 100 : 0;

  // ── Exports ──
  const exportCSV = () => {
    const rows = [
      ["BoiAro Financial Summary"], ["Period", periodLabel], ["Generated", reportDate], [""],
      ["KPI", "Value (BDT)"],
      ["Total Revenue", totalRevenue], ["Gross Profit", grossProfit], ["Net Profit", netProfit],
      ["Profit Margin", `${profitMargin.toFixed(1)}%`], ["Orders", totalOrderCount],
      ["AOV", avgOrderValue.toFixed(0)], ["Customers", uniqueCustomers], ["Users", totalUsers],
      ["Creator Payouts", creatorPayouts], ["Expenses", totalExpense], [""],
      ["Format", "Revenue"], ...formatData.map(f => [f.name, f.value]), [""],
      ["Month", "Revenue", "Expense", "Profit"],
      ...monthlyTrend.map(m => [m.month, m.revenue, m.expense, m.profit]), [""],
      ["Cash Flow"], ["Online Inflow", onlineInflow], ["COD Settled", codSettled], ["COD Pending", codPending],
      ["Payouts Made", paidWithdrawals], ["Payouts Pending", pendingWithdrawals],
    ];
    const csv = rows.map(r => (r as any[]).join(",")).join("\n");
    downloadBlob(csv, `boiaro-investor-${periodFilter}.csv`, "text/csv");
    toast.success("CSV exported");
  };

  const exportExcel = () => {
    const rows = [
      ["BoiAro — Investor Financial Summary"], ["Period", periodLabel], ["Generated", reportDate], [""],
      ["KEY PERFORMANCE INDICATORS"], ["Metric", "Value"],
      ["Total Revenue (BDT)", totalRevenue], ["Gross Profit (BDT)", grossProfit],
      ["Net Profit (BDT)", netProfit], ["Profit Margin", `${profitMargin.toFixed(1)}%`],
      ["MoM Revenue Growth", `${revenueGrowth.toFixed(1)}%`],
      ["Confirmed Orders", totalOrderCount], ["Average Order Value", avgOrderValue.toFixed(0)],
      ["Unique Customers", uniqueCustomers], ["Total Users", totalUsers],
      ["Creator Payouts", creatorPayouts], ["Operating Expenses", totalExpense], [""],
      ["REVENUE BY FORMAT"], ["Format", "Revenue (BDT)"],
      ...formatData.map(f => [f.name, f.value]), [""],
      ["MONTHLY TRENDS"], ["Month", "Revenue", "Expense", "Profit", "Orders"],
      ...monthlyTrend.map(m => [m.month, m.revenue, m.expense, m.profit, m.orders]), [""],
      ["CASH FLOW"], ["Online Inflow", onlineInflow], ["COD Settled", codSettled],
      ["COD Pending Collection", codPending], ["COD Collected (In Transit)", codCollected],
      ["Payouts Completed", paidWithdrawals], ["Payouts Pending", pendingWithdrawals], [""],
      ["TOP BOOKS"], ["Book", "Revenue", "Qty Sold"],
      ...topBooks.map(b => [b.title, b.revenue, b.qty]),
    ];
    const tsv = rows.map(r => (r as any[]).join("\t")).join("\n");
    downloadBlob(tsv, `boiaro-investor-${periodFilter}.xls`, "application/vnd.ms-excel");
    toast.success("Excel exported");
  };

  const downloadBlob = (content: string, filename: string, type: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
  };

  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const periodLabel = ({ all: "All Time", today: "Today", this_month: "This Month", last_month: "Last Month", this_year: "This Year" } as Record<string, string>)[periodFilter];
  const pm = presentationMode;

  return (
    <div className={`space-y-6 ${pm ? "max-w-5xl mx-auto" : ""}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden ">
        <div>
          <h1 className={`font-bold flex items-center gap-2 text-black ${pm ? "text-3xl" : "text-2xl"}`}>
             {pm ? "BoiAro — Financial Summary" : "Investor Summary"}
          </h1>
          {!pm && <p className="text-sm text-black">Presentation-ready financial overview</p>}
          {pm && <p className="text-sm text-black mt-1">Period: {periodLabel} · {reportDate}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={pm ? "default" : "outline"}
            onClick={() => setPresentationMode(!pm)}
            className="gap-1.5"
          >
            <Presentation className="w-4 h-4" />{pm ? "Exit Present" : "Present"}
          </Button>
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as RevenuePeriod)}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
            </SelectContent>
          </Select>
          {!pm && <>
            <Button size="sm" variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button size="sm" variant="outline" onClick={exportExcel}><Download className="w-4 h-4 mr-1" />Excel</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" />Print</Button>
          </>}
        </div>
      </div>

      {/* ── Print Header ── */}
      <div className="hidden print:block mb-6">
        <h1 className="text-3xl font-bold">BoiAro — Financial Summary</h1>
        <p className="text-sm text-black mt-1">Period: {periodLabel} · Generated: {reportDate}</p>
        <div className="border-b-2 border-primary mt-3" />
      </div>

      {/* ── Hero KPIs ── */}
      <div className={`grid gap-3 print:grid-cols-4 print:gap-2 ${pm ? "grid-cols-4" : "grid-cols-2 md:grid-cols-4"}`}>

        {/* <KPICard label="Verified Order Revenue" value={`৳${totalRevenue.toLocaleString()}`} sub="From verified paid orders only" icon={TrendingUp} variant="primary" large={pm} /> */}

        <SummaryCard
              icon={TrendingUp}
              title="Verified paid Order Revenue"
              value={totalRevenue.toLocaleString()}
              color="#017B51"
            />
        
        {/* <KPICard label="Net Profit" value={`৳${netProfit.toLocaleString()}`} sub={`${profitMargin.toFixed(1)}% margin`} icon={netProfit >= 0 ? TrendingUp : TrendingDown} variant={netProfit >= 0 ? "success" : "danger"} large={pm} /> */}

          <SummaryCard
              icon={TrendingUp}
              title={`${profitMargin.toFixed(1)}% Profit Margin`}
              value={netProfit.toLocaleString()}
              color="#017B51"
            />

        {/* <KPICard label="Orders" value={totalOrderCount.toLocaleString()} sub={`AOV ৳${avgOrderValue.toFixed(0)}`} icon={ShoppingCart} variant="info" large={pm} /> */}

        <SummaryCard
              icon={''}
              title={`AOV ${avgOrderValue.toFixed(0)}`}
              value={`Orders ${totalOrderCount.toLocaleString()}`}
              color="#017B51"
            />

        {/* <KPICard label="Customers" value={uniqueCustomers.toLocaleString()} sub={`of ${totalUsers.toLocaleString()} users`} icon={Users} variant="amber" large={pm} /> */}

         <SummaryCard
              icon={Users}
              title={`of ${totalUsers.toLocaleString()} users`}
              value={`Customers ${uniqueCustomers.toLocaleString()}`}
              color="#017B51"
            />
      </div>

      {/* ── Growth Indicator Row ── */}
      <div className={`grid gap-3 ${pm ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>

        {/* <GrowthCard label="MoM Revenue" value={revenueGrowth} suffix="%" /> */}

        <SummaryCard
              icon={Users}
              title={`MoM Revenue`}
              value={`${revenueGrowth}%`}
              color="#017B51"
            />

        {/* <GrowthCard label="This Month Revenue" value={thisMonthRev} prefix="৳" raw /> */}
        <SummaryCard
              icon={``}
              title={`This Month Revenue`}
              value={`${thisMonthRev}`}
              color="#017B51"
            />
        {/* <GrowthCard label="Last Month Revenue" value={lastMonthRev} prefix="৳" raw /> */}
        <SummaryCard
              icon={``}
              title={`Last Month Revenue`}
              value={`${lastMonthRev}`}
              color="#017B51"
            />
      </div>

      {/* ── Tabbed Sections ── */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className={`grid w-full gap-5 ${pm ? "grid-cols-4 text-base" : "grid-cols-4"}`}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="growth">Growth</TabsTrigger>
          <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          <TabsTrigger value="books">Top Books</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className={`grid gap-4 ${pm ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}>
            {/* P&L */}
            <Card className="border-border/30 print:border print:shadow-none">
              <CardHeader className="pb-2"><CardTitle className={`font-semibold ${pm ? "text-base" : "text-sm"}`}>Profit & Loss</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <PLLine label="Revenue" value={totalRevenue} positive large={pm} />
                <PLLine label="Buying Cost" value={totalBuyingCost} large={pm} />
                <PLLine label="Packaging" value={totalPackaging} large={pm} />
                <PLLine label="Fulfillment" value={totalFulfillment} large={pm} />
                <div className="border-t border-border/50 pt-1.5">
                  <PLLine label="Gross Profit" value={grossProfit} positive={grossProfit >= 0} bold large={pm} />
                </div>
                <PLLine label="Creator Payouts" value={creatorPayouts} large={pm} />
                <PLLine label="Operating Expenses" value={totalExpense} large={pm} />
                <div className="border-t-2 border-primary/40 pt-2">
                  <PLLine label="Net Profit" value={netProfit} positive={netProfit >= 0} bold large={pm} />
                </div>
              </CardContent>
            </Card>

            {/* Format Pie */}
            <Card className="border-border/30 print:border print:shadow-none">
              <CardHeader className="pb-2"><CardTitle className={`font-semibold ${pm ? "text-base" : "text-sm"}`}>Revenue by Format</CardTitle></CardHeader>
              <CardContent>
                {formatData.length > 0 ? (
                  <div className="flex items-center gap-6">
                    <div className={pm ? "w-[170px] h-[170px]" : "w-[140px] h-[140px]"}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={formatData} cx="50%" cy="50%" outerRadius={pm ? 75 : 60} dataKey="value" strokeWidth={0}>
                          {formatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie></PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-3">
                      {formatData.map((f, i) => (
                        <div key={f.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className={pm ? "text-base" : "text-sm"}>{f.name}</span>
                          </div>
                          <span className={`font-semibold ${pm ? "text-base" : "text-sm"}`}>৳{f.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <p className="text-center text-muted-foreground py-10">No format data</p>}
              </CardContent>
            </Card>
          </div>

          {/* Monthly Revenue Chart */}
          <Card className="border-border/30 print:break-inside-avoid">
            <CardHeader className="pb-2"><CardTitle className={`font-semibold ${pm ? "text-base" : "text-sm"}`}>Monthly Revenue & Profit</CardTitle></CardHeader>
            <CardContent>
              {monthlyTrend.length > 0 ? (
                <div className={pm ? "h-[300px]" : "h-[250px]"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: pm ? 12 : 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: pm ? 12 : 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, n: string) => [`৳${v.toLocaleString()}`, n]} />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-center text-muted-foreground py-10">No trend data</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Growth Tab ── */}
        <TabsContent value="growth" className="space-y-4">
          {/* Daily Revenue (last 30 days) */}
          <Card className="border-border/30">
            <CardHeader className="pb-2"><CardTitle className={`font-semibold ${pm ? "text-base" : "text-sm"}`}>Daily Revenue — Last 30 Days</CardTitle></CardHeader>
            <CardContent>
              {dailyGrowth.length > 0 ? (
                <div className={pm ? "h-[280px]" : "h-[220px]"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyGrowth}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, n: string) => [n === "Revenue" ? `৳${v.toLocaleString()}` : v, n]} />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-center text-muted-foreground py-10">No recent data</p>}
            </CardContent>
          </Card>

          {/* Orders + New Users Trend */}
          <div className={`grid gap-4 ${pm ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}>
            <Card className="border-border/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Orders</CardTitle></CardHeader>
              <CardContent>
                {dailyGrowth.length > 0 ? (
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyGrowth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Bar dataKey="orders" name="Orders" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-center text-muted-foreground py-8 text-sm">No data</p>}
              </CardContent>
            </Card>
            <Card className="border-border/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Order & User Trend</CardTitle></CardHeader>
              <CardContent>
                {monthlyTrend.length > 0 ? (
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="orders" name="Orders" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="users" name="New Users" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-center text-muted-foreground py-8 text-sm">No data</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Cash Flow Tab ── */}
        <TabsContent value="cashflow" className="space-y-4">
          <div className={`grid gap-3 ${pm ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>
            <CashFlowCard icon={Landmark} label="Total Inflow" value={totalInflow} sub="Online + settled COD" color="emerald" />
            <CashFlowCard icon={HandCoins} label="Total Outflow" value={totalOutflow} sub="Payouts + expenses" color="red" />
            <CashFlowCard icon={Banknote} label="Net Cash Flow" value={totalInflow - totalOutflow} sub="Inflow − outflow" color={totalInflow - totalOutflow >= 0 ? "emerald" : "red"} />
          </div>

          <div className={`grid gap-4 ${pm ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}>
            {/* COD Pipeline */}
            <Card className="border-border/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">COD Pipeline</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <CodPipeLine label="Pending Collection" value={codPending} color="text-amber-400" />
                <CodPipeLine label="Collected by Courier" value={codCollected} color="text-blue-400" />
                <CodPipeLine label="Settled to Account" value={codSettled} color="text-emerald-400" />
                <div className="border-t border-border/50 pt-2">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total COD Orders</span>
                    <span>৳{(codPending + codCollected + codSettled).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payout Status */}
            <Card className="border-border/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payout Status</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <CodPipeLine label="Creator Payouts (Earned)" value={creatorPayouts} color="text-primary" />
                <CodPipeLine label="Withdrawals Paid" value={paidWithdrawals} color="text-emerald-400" />
                <CodPipeLine label="Withdrawals Pending" value={pendingWithdrawals} color="text-amber-400" />
                <CodPipeLine label="Operating Expenses" value={totalExpense} color="text-red-400" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Top Books Tab ── */}
        <TabsContent value="books">
          <Card className="border-border/30 print:break-inside-avoid">
            <CardHeader className="pb-2"><CardTitle className={`font-semibold flex items-center gap-2 ${pm ? "text-base" : "text-sm"}`}><BookOpen className="w-4 h-4" /> Top 5 Books by Revenue</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-white">#</TableHead>
                    <TableHead className="text-white">Book</TableHead>
                    <TableHead className="text-right text-white">Qty</TableHead>
                    <TableHead className="text-right text-white">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topBooks.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No sales data</TableCell></TableRow>
                  ) : topBooks.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                      <TableCell className={`font-medium ${pm ? "text-base" : "text-sm"}`}>{b.title}</TableCell>
                      <TableCell className="text-right text-sm">{b.qty}</TableCell>
                      <TableCell className={`text-right font-semibold ${pm ? "text-base" : "text-sm"}`}>৳{b.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Print Footer ── */}
      <div className="hidden print:block mt-8 pt-4 border-t text-xs text-muted-foreground">
        <p>BoiAro Financial Summary · {periodLabel} · Generated {reportDate}</p>
        <p className="mt-0.5">Revenue: confirmed online payments & settled COD only. Net of discounts. Excludes pending/failed/cancelled.</p>
      </div>
    </div>
  );
}

// ── Sub-components ──

function KPICard({ label, value, sub, icon: Icon, variant, large }: {
  label: string; value: string; sub: string; icon: any;
  variant: "primary" | "success" | "danger" | "info" | "amber"; large?: boolean;
}) {
  const c = {
    primary: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20" },
    success: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
    danger: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20" },
    info: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20" },
  }[variant];
  return (
    <Card className={`${c.border} print:border print:shadow-none`}>
      <CardContent className={large ? "p-5" : "p-4"}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`${large ? "p-2" : "p-1.5"} rounded-lg ${c.bg}`}><Icon className={`${large ? "w-5 h-5" : "w-4 h-4"} ${c.text}`} /></div>
          <span className={`text-muted-foreground font-medium ${large ? "text-sm" : "text-xs"}`}>{label}</span>
        </div>
        <p className={`font-bold ${large ? "text-3xl" : "text-2xl"} print:text-xl`}>{value}</p>
        <p className={`text-muted-foreground mt-0.5 ${large ? "text-xs" : "text-[11px]"}`}>{sub}</p>
      </CardContent>
    </Card>
  );
}

function GrowthCard({ label, value, prefix, suffix, raw }: { label: string; value: number; prefix?: string; suffix?: string; raw?: boolean }) {
  const isUp = value >= 0;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  const display = raw ? `${prefix || ""}${Math.abs(value).toLocaleString()}` : `${isUp ? "+" : ""}${value.toFixed(1)}${suffix || ""}`;
  return (
    <Card className="border-border/30">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className={`text-lg font-bold ${raw ? "" : isUp ? "text-emerald-500" : "text-destructive"}`}>{display}</p>
        </div>
        {!raw && <div className={`p-1.5 rounded-full ${isUp ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
          <Icon className={`w-4 h-4 ${isUp ? "text-emerald-500" : "text-destructive"}`} />
        </div>}
      </CardContent>
    </Card>
  );
}

function PLLine({ label, value, positive, bold, large }: { label: string; value: number; positive?: boolean; bold?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${bold ? "font-semibold" : ""} ${large ? "text-base" : "text-sm"}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className={positive ? "text-emerald-500" : bold ? (value >= 0 ? "text-emerald-500" : "text-destructive") : "text-destructive/80"}>
        {positive ? "+" : "−"}৳{Math.abs(value).toLocaleString()}
      </span>
    </div>
  );
}

function CashFlowCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: number; sub: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
    red: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/20" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20" },
  };
  const c = colorMap[color] || colorMap.emerald;
  return (
    <Card className={c.border}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${c.bg}`}><Icon className={`w-5 h-5 ${c.text}`} /></div>
        <div>
          <p className={`text-2xl font-bold ${c.text}`}>৳{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground/70">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CodPipeLine({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color}`}>৳{value.toLocaleString()}</span>
    </div>
  );
}
