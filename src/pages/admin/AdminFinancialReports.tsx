import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BookOpen, Wallet, FileText } from "lucide-react";
import {
  isVerifiedRevenueOrder, isInPeriod, calculateOrderProfit, getItemBuyingCost,
  getOrderSellableAmount, calculateTotalDeliveryCharges, getLedgerOtherIncome, detectDuplicateLedgerEntries,
  type RevenueOrder, type RevenuePeriod, type OrderItemWithCost,
} from "@/hooks/useUnifiedRevenue";
import SummaryCard from '@/components/admin/SummaryCard';


const chartTooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

export default function AdminFinancialReports() {
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [_formats, setFormats] = useState<any[]>([]);
  const [bookFormatCosts, setBookFormatCosts] = useState<any[]>([]);
  const [periodFilter, setPeriodFilter] = useState<RevenuePeriod>("all");

  useEffect(() => {
    Promise.all([
      supabase.from("orders").select("id, total_amount, status, created_at, packaging_cost, fulfillment_cost, shipping_cost, payment_method, cod_payment_status, purchase_cost_per_unit, is_purchased"),
      supabase.from("order_items").select("order_id, book_id, format, unit_price, quantity, books(title)"),
      supabase.from("accounting_ledger" as any).select("*").order("entry_date", { ascending: false }),
      supabase.from("contributor_earnings").select("book_id, format, role, earned_amount, sale_amount, status, created_at, books(title)"),
      supabase.from("book_formats").select("book_id, format, original_price, discount, publisher_commission_percent, unit_cost"),
    ]).then(([o, oi, l, e, f]) => {
      setOrders(o.data || []);
      setOrderItems(oi.data || []);
      setLedger((l.data as any[]) || []);
      setEarnings(e.data || []);
      setFormats(f.data || []);
      setBookFormatCosts(f.data || []);
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

  // Enrich order items with cost data
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

  // ── P&L ──
  // Product revenue EXCLUDES delivery charge (customer-paid pass-through)
  const totalRevenue = paidOrders.reduce((s, o) => s + getOrderSellableAmount(o as RevenueOrder), 0);
  const totalDeliveryCharges = calculateTotalDeliveryCharges(paidOrders as RevenueOrder[]);
  // Other Income = ledger income EXCLUDING book_sale tied to orders (already counted in Product Revenue)
  const otherIncome = getLedgerOtherIncome(filteredLedger);
  const totalExpense = filteredLedger.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  // Detect & log any duplicate ledger entries
  const dupes = detectDuplicateLedgerEntries(filteredLedger);
  if (dupes.length > 0) console.warn("[revenue] Duplicate ledger entries found:", dupes);
  const totalBuyingCost = enrichedItems.reduce((s, i) => s + getItemBuyingCost(i) * i.quantity, 0);
  const totalPackaging = paidOrders.reduce((s, o) => s + (o.packaging_cost || 0), 0);
  const totalFulfillment = paidOrders.reduce((s, o) => s + (o.fulfillment_cost || 0), 0);
  // Creator payouts: only count digital format earnings (hardcopy uses inventory model, no creator payout)
  const creatorPayouts = earnings.filter(e => e.role !== "platform" && e.status !== "reversed" && e.format !== "hardcopy" && filterByPeriod(e.created_at))
    .reduce((s, e) => s + Number(e.earned_amount), 0);
  // Gross Profit = Product Revenue - Buying Cost - Packaging - Fulfillment (delivery excluded)
  const grossProfit = totalRevenue - totalBuyingCost - totalPackaging - totalFulfillment;
  // Net Profit = Gross Profit - Creator Payouts (digital only) - Operating Expenses + Other Income
  const netProfit = grossProfit - creatorPayouts - totalExpense + otherIncome;

  // ── Monthly Revenue vs Expense (with item-level profit) ──
  const monthlyData = useMemo(() => {
    // Build items-by-order map
    const itemsByOrder: Record<string, OrderItemWithCost[]> = {};
    enrichedItems.forEach(i => {
      if (!itemsByOrder[i.order_id]) itemsByOrder[i.order_id] = [];
      itemsByOrder[i.order_id].push(i);
    });

    const map: Record<string, { month: string; revenue: number; expense: number; profit: number }> = {};
    paidOrders.forEach(o => {
      const m = o.created_at?.slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { month: m, revenue: 0, expense: 0, profit: 0 };
      map[m].revenue += getOrderSellableAmount(o as RevenueOrder);
      map[m].profit += calculateOrderProfit(o as RevenueOrder, itemsByOrder[o.id] || []);
    });
    filteredLedger.forEach(e => {
      const m = e.entry_date?.slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { month: m, revenue: 0, expense: 0, profit: 0 };
      if (e.type === "expense") map[m].expense += Number(e.amount);
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [paidOrders, filteredLedger, enrichedItems]);

  // ── Book-wise Profit ──
  const bookProfitData = useMemo(() => {
    const bookMap: Record<string, { title: string; revenue: number; buyingCost: number; profit: number; sales: number }> = {};

    enrichedItems.forEach(item => {
      const key = item.book_id;
      if (!key) return;
      const title = orderItems.find((i: any) => i.book_id === key)?.books?.title || "Unknown";
      if (!bookMap[key]) bookMap[key] = { title, revenue: 0, buyingCost: 0, profit: 0, sales: 0 };
      bookMap[key].revenue += item.unit_price * item.quantity;
      bookMap[key].buyingCost += getItemBuyingCost(item) * item.quantity;
      bookMap[key].sales += item.quantity;
    });

    Object.values(bookMap).forEach(b => { b.profit = b.revenue - b.buyingCost; });
    return Object.values(bookMap).sort((a, b) => b.profit - a.profit);
  }, [enrichedItems, orderItems]);

  // ── Format-wise Profit ──
  const formatProfitData = useMemo(() => {
    const fmtMap: Record<string, { format: string; revenue: number; buyingCost: number; profit: number }> = {
      ebook: { format: "eBook", revenue: 0, buyingCost: 0, profit: 0 },
      audiobook: { format: "Audiobook", revenue: 0, buyingCost: 0, profit: 0 },
      hardcopy: { format: "Hard Copy", revenue: 0, buyingCost: 0, profit: 0 },
    };

    enrichedItems.forEach(item => {
      if (fmtMap[item.format]) {
        fmtMap[item.format].revenue += item.unit_price * item.quantity;
        fmtMap[item.format].buyingCost += getItemBuyingCost(item) * item.quantity;
      }
    });

    // For digital formats, also subtract creator earnings
    earnings.filter(e => e.role !== "platform" && e.status !== "reversed" && e.format !== "hardcopy" && filterByPeriod(e.created_at)).forEach(e => {
      if (fmtMap[e.format]) fmtMap[e.format].buyingCost += Number(e.earned_amount);
    });

    Object.values(fmtMap).forEach(f => { f.profit = f.revenue - f.buyingCost; });
    return Object.values(fmtMap).filter(f => f.revenue > 0);
  }, [enrichedItems, earnings, periodFilter]);

  // ── COD Tracking ──
  const codOrders = useMemo(() => orders.filter(o => o.payment_method === "cod" && filterByPeriod(o.created_at)), [orders, periodFilter]);
  const codPending = codOrders.filter(o => o.cod_payment_status === "cod_pending_collection" || o.cod_payment_status === "unpaid")
    .reduce((s, o) => s + (o.total_amount || 0), 0);
  const codCollected = codOrders.filter(o => o.cod_payment_status === "collected_by_courier")
    .reduce((s, o) => s + (o.total_amount || 0), 0);
  const codSettled = codOrders.filter(o => ["settled_to_merchant", "paid"].includes(o.cod_payment_status))
    .reduce((s, o) => s + (o.total_amount || 0), 0);

  // ── Top Earning Books ──
  const topEarningBooks = bookProfitData.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-black">
               Financial Reports
          </h1>
          
        </div>
        <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as RevenuePeriod)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="pnl" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 gap-5">
          <TabsTrigger value="pnl">P&L Statement</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Trends</TabsTrigger>
          <TabsTrigger value="books">Book-wise Profit</TabsTrigger>
          <TabsTrigger value="cod">COD Tracking</TabsTrigger>
        </TabsList>

        {/* ── P&L Statement ── */}
        <TabsContent value="pnl" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* <PLCard label="Verified Order Revenue" value={totalRevenue} icon={TrendingUp} color="text-emerald-400" bg="bg-emerald-500/10" /> */}
            <SummaryCard
              icon={TrendingUp}
              title="Verified Order Revenue"
              value={totalRevenue}
              color="#017B51"
            />

            {/* <PLCard label="Gross Profit" value={grossProfit} icon={DollarSign} color="text-blue-400" bg="bg-blue-500/10" /> */}
            <SummaryCard
              icon={DollarSign}
              title="Gross Profit"
              value={grossProfit}
              color="#017B51"
            />
            {/* <PLCard label="Creator Payouts" value={creatorPayouts} icon={Wallet} color="text-amber-400" bg="bg-amber-500/10" /> */}
            <SummaryCard
              icon={Wallet}
              title="Creator Payouts"
              value={creatorPayouts}
              color="#017B51"
            />
            {/* <PLCard label="Net Profit" value={netProfit} icon={netProfit >= 0 ? TrendingUp : TrendingDown} color={netProfit >= 0 ? "text-primary" : "text-destructive"} bg={netProfit >= 0 ? "bg-primary/10" : "bg-destructive/10"} /> */}

              <SummaryCard
                icon={TrendingUp}
                title="Net Profit"
                value={netProfit}
                color="#017B51"
              />
          </div>

          {/* Format-wise Profit */}
          {formatProfitData.length > 0 && (
            <Card className="border-border/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Format-wise Profit</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {formatProfitData.map(f => (
                    <div key={f.format} className="p-3 rounded-lg bg-white text-center border border-gray-300">
                      <p className="text-xs text-black mb-1">{f.format}</p>
                      <p className="text-lg font-bold">৳{f.revenue.toLocaleString()}</p>
                      <p className="text-[10px] text-black">Revenue</p>
                      <p className={`text-sm font-semibold mt-1 ${f.profit >= 0 ? "text-[#017B51]" : "text-red-500"}`}>
                        ৳{f.profit.toLocaleString()} profit
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Profit & Loss Breakdown</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <PLRow label="Product Revenue (excl. delivery)" value={totalRevenue} type="income" bold />
                  <PLRow  label="Customer Delivery Charges (pass-through)" value={totalDeliveryCharges} type="info" />
                  <PLRow label="(−) Buying Cost (unit_cost × qty)" value={totalBuyingCost} type="expense" />
                  <PLRow label="(−) Packaging Costs" value={totalPackaging} type="expense" />
                  <PLRow label="(−) Fulfillment Costs" value={totalFulfillment} type="expense" />
                  <PLRow label="= Gross Profit" value={grossProfit} type={grossProfit >= 0 ? "income" : "expense"} bold />
                  <PLRow label="(−) Creator Payouts (Writer + Narrator + Publisher)" value={creatorPayouts} type="expense" />
                  <PLRow label="(−) Operating Expenses (Ledger)" value={totalExpense} type="expense" />
                  <PLRow label="(+) Other Income (Ledger)" value={otherIncome} type="income" />
                  <TableRow className="border-t-2 border-primary/30">
                    <TableCell className="font-bold text-base">= Net Profit</TableCell>
                    <TableCell className={`text-right font-bold text-base ${netProfit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                      ৳{netProfit.toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          
        </TabsContent>

        {/* ── Monthly Trends ── */}
        <TabsContent value="monthly" className="space-y-4">
          <Card className="border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue vs Expense vs Profit</CardTitle></CardHeader>
            <CardContent>
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [`৳${v.toLocaleString()}`, name]} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-10">No data for selected period</p>}
            </CardContent>
          </Card>

          {/* Cumulative Trend */}
          <Card className="border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Cumulative Revenue Trend</CardTitle></CardHeader>
            <CardContent>
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthlyData.reduce((acc: any[], m, i) => {
                    const prev = i > 0 ? acc[i - 1] : { cumRevenue: 0, cumProfit: 0 };
                    acc.push({ month: m.month, cumRevenue: prev.cumRevenue + m.revenue, cumProfit: prev.cumProfit + m.profit });
                    return acc;
                  }, [])}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [`৳${v.toLocaleString()}`, name]} />
                    <Legend />
                    <Line type="monotone" dataKey="cumRevenue" name="Cumulative Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cumProfit" name="Cumulative Profit" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-10">No data</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Book-wise Profit ── */}
        <TabsContent value="books" className="space-y-4">
          <Card className="border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4" /> Book-wise Profit Report</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead  className=" text-white">#</TableHead>
                    <TableHead className=" text-white">Book</TableHead>
                    <TableHead className="text-right text-white">Sales</TableHead>
                    <TableHead className="text-right text-white">Revenue</TableHead>
                    <TableHead className="text-right text-white">Buying Cost</TableHead>
                    <TableHead className="text-right text-white">Profit</TableHead>
                    <TableHead className="text-right text-white">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookProfitData.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-black py-10">No sales data for this period</TableCell></TableRow>
                  ) : bookProfitData.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-black text-xs">{i + 1}</TableCell>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">{b.title}</TableCell>
                      <TableCell className="text-right text-sm">{b.sales}</TableCell>
                      <TableCell className="text-right text-sm">৳{b.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm text-black">৳{b.buyingCost.toLocaleString()}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${b.profit >= 0 ? "text-[#017B51]" : "text-red-500"}`}>
                        ৳{b.profit.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs text-black">
                        {b.revenue > 0 ? `${((b.profit / b.revenue) * 100).toFixed(0)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Top 10 chart */}
          {topEarningBooks.length > 0 && (
            <Card className="border-border/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Most Profitable Books</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topEarningBooks.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="title" type="category" width={120} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [`৳${v.toLocaleString()}`, name]} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── COD Tracking ── */}
        <TabsContent value="cod" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            <SummaryCard
              icon=""
              title="Pending COD Collection"
              value={codPending.toLocaleString()}
              color="#cc2e06"
            />


            <SummaryCard
              icon={Wallet}
              title="Collected by Courier"
              value={codCollected.toLocaleString()}
              color="#017B51"
            />

            <SummaryCard
              icon={TrendingUp}
              title="Settled to Account"
              value={codSettled.toLocaleString()}
              color="#017B51"
            />
          </div>

          <Card className="border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">COD Orders Detail</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-white">Order</TableHead>
                    <TableHead className="text-white">Date</TableHead>
                    <TableHead className="text-white">Amount</TableHead>
                    <TableHead className="text-white">Delivery</TableHead>
                    <TableHead className="text-white">COD Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No COD orders</TableCell></TableRow>
                  ) : codOrders.slice(0, 50).map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">#{o.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">৳{o.total_amount}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize text-black">{o.status}</Badge></TableCell>
                      <TableCell >
                        <CodBadge  status={o.cod_payment_status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PLCard({ label, value, icon: Icon, color, bg }: { label: string; value: number; icon: any; color: string; bg: string }) {
  return (
    <Card className="border-border/30">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bg}`}><Icon className={`w-5 h-5 ${color}`} /></div>
        <div>
          <p className="text-lg font-bold">৳{value.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PLRow({ label, value, type, bold }: { label: string; value: number; type: "income" | "expense" | "info"; bold?: boolean }) {
  return (
    <TableRow>
      <TableCell className={bold ? "font-semibold" : "text-black text-sm"}>{label}</TableCell>
      <TableCell className={`text-right ${bold ? "font-semibold" : ""} ${type === "income" ? "text-emerald-400" : type === "info" ? "text-black" : "text-red-400"}`}>
        ৳{value.toLocaleString()}
      </TableCell>
    </TableRow>
  );
}

function CodBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    unpaid: { label: "Unpaid", cls: "bg-red-500/20 text-red-400" },
    cod_pending_collection: { label: "Pending", cls: "bg-amber-500/20 text-amber-400" },
    collected_by_courier: { label: "Collected", cls: "bg-blue-500/20 text-blue-400" },
    settled_to_merchant: { label: "Settled", cls: "bg-emerald-500/20 text-emerald-400" },
    paid: { label: "Paid", cls: "bg-green-500/20 text-green-400" },
  };
  const c = config[status] || { label: status || "N/A", cls: "bg-[#017B51] text-white border-0" };
  return <Badge variant="outline" className={`text-[10px] ${c.cls}`}>{c.label}</Badge>;
}
