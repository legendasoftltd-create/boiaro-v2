import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, ShoppingCart, Users, BookOpen, Download,
  TrendingUp, BarChart3, PieChart as PieChartIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Area, AreaChart,
} from "recharts";
import { format } from "date-fns";
import { isVerifiedRevenueOrder, isInDateRange, type RevenueOrder } from "@/hooks/useUnifiedRevenue";

const COLORS = ["hsl(var(--primary))", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

interface OrderItem {
  order_id?: string;
  format: string;
  unit_price: number;
  quantity: number;
  book_id: string;
  books: { title: string; author_id: string | null; publisher_id: string | null; category_id: string | null } | null;
}

interface EarningRow {
  user_id: string;
  role: string;
  earned_amount: number;
  status: string;
  book_id: string;
  format: string;
}

function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
}

export default function AdminAnalytics() {
  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data, isLoading: loading } = trpc.admin.analyticsReportData.useQuery();
  const orders = (data?.orders || []) as any[];
  const orderItems = (data?.orderItems || []) as OrderItem[];
  const earnings = (data?.earnings || []) as EarningRow[];
  const categories = (data?.categories || []) as { id: string; name: string; name_bn?: string }[];
  const profiles = (data?.profiles || []) as { user_id: string; display_name: string | null }[];

  // Filtered orders — unified revenue logic: only verified revenue orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!isVerifiedRevenueOrder(o as RevenueOrder)) return false;
      if (!isInDateRange(o.created_at, dateFrom || undefined, dateTo || undefined)) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo]);

  

  // Only include items from verified revenue orders
  const allVerifiedIds = useMemo(() => new Set(orders.filter(o => isVerifiedRevenueOrder(o as RevenueOrder)).map(o => o.id)), [orders]);

  const filteredItems = useMemo(() => {
    return orderItems.filter(item => {
      // Only include items belonging to verified orders
      if (!(item as any).order_id || !allVerifiedIds.has((item as any).order_id)) return false;
      if (formatFilter !== "all" && item.format !== formatFilter) return false;
      if (categoryFilter !== "all" && item.books?.category_id !== categoryFilter) return false;
      return true;
    });
  }, [orderItems, formatFilter, categoryFilter, allVerifiedIds]);

  // === SUMMARY CARDS ===
  const totalRevenue = filteredOrders.reduce((s, o) => s + ((o.total_amount || 0) - (o.shipping_cost || 0)), 0);
  const totalOrdersCount = filteredOrders.length;
  const uniqueUsers = new Set(filteredOrders.map(o => o.user_id)).size;
  const totalBooksSold = filteredItems.reduce((s, i) => s + (i.quantity || 1), 0);

  // === REVENUE OVER TIME (line chart) ===
  const revenueOverTime = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const d = format(new Date(o.created_at), "yyyy-MM");
      map[d] = (map[d] || 0) + (o.total_amount || 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, revenue]) => ({ month, revenue }));
  }, [filteredOrders]);

  // === DAILY SALES ===
  const dailySales = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (!map[d]) map[d] = { count: 0, revenue: 0 };
      map[d].count++;
      map[d].revenue += o.total_amount || 0;
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([date, v]) => ({ date, ...v }));
  }, [filteredOrders]);

  // === REVENUE BY FORMAT ===
  const revenueByFormat = useMemo(() => {
    const map: Record<string, number> = {};
    filteredItems.forEach(i => {
      const fmt = i.format || "unknown";
      map[fmt] = (map[fmt] || 0) + (i.unit_price || 0) * (i.quantity || 1);
    });
    return Object.entries(map).map(([name, value]) => ({ name: name === "ebook" ? "eBook" : name === "audiobook" ? "Audiobook" : name === "hardcopy" ? "Hard Copy" : name, value }));
  }, [filteredItems]);

  // === BOOK-WISE SALES ===
  const bookSales = useMemo(() => {
    const map: Record<string, { title: string; sales: number; revenue: number; ebook: number; audiobook: number; hardcopy: number }> = {};
    filteredItems.forEach(i => {
      const key = i.book_id;
      if (!key) return;
      if (!map[key]) map[key] = { title: i.books?.title || "Unknown", sales: 0, revenue: 0, ebook: 0, audiobook: 0, hardcopy: 0 };
      const qty = i.quantity || 1;
      const rev = (i.unit_price || 0) * qty;
      map[key].sales += qty;
      map[key].revenue += rev;
      if (i.format === "ebook") map[key].ebook += rev;
      else if (i.format === "audiobook") map[key].audiobook += rev;
      else if (i.format === "hardcopy") map[key].hardcopy += rev;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems]);

  // === CREATOR EARNINGS ===
  const creatorEarnings = useMemo(() => {
    const map: Record<string, { user_id: string; role: string; total: number; pending: number; paid: number }> = {};
    earnings.forEach(e => {
      const key = `${e.user_id}-${e.role}`;
      if (!map[key]) map[key] = { user_id: e.user_id, role: e.role, total: 0, pending: 0, paid: 0 };
      map[key].total += e.earned_amount || 0;
      if (e.status === "paid") map[key].paid += e.earned_amount || 0;
      else map[key].pending += e.earned_amount || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [earnings]);

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach(p => { m[p.user_id] = p.display_name || p.user_id.slice(0, 8); });
    return m;
  }, [profiles]);

  // === TOP READERS ===
  const topReaders = useMemo(() => {
    const map: Record<string, { user_id: string; orders: number; spent: number }> = {};
    filteredOrders.forEach(o => {
      if (!map[o.user_id]) map[o.user_id] = { user_id: o.user_id, orders: 0, spent: 0 };
      map[o.user_id].orders++;
      map[o.user_id].spent += o.total_amount || 0;
    });
    return Object.values(map).sort((a, b) => b.spent - a.spent).slice(0, 10);
  }, [filteredOrders]);

  const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

  if (loading) return <div className="animate-pulse text-muted-foreground p-4">Loading analytics...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Analytics & Reports</h1>
      </div>

      {/* FILTERS */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Format</label>
              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Formats</SelectItem>
                  <SelectItem value="ebook">eBook</SelectItem>
                  <SelectItem value="audiobook">Audiobook</SelectItem>
                  <SelectItem value="hardcopy">Hard Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_bn || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setFormatFilter("all"); setCategoryFilter("all"); }}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Verified Order Revenue", value: `৳${totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-green-400" },
          { label: "Total Orders", value: totalOrdersCount, icon: ShoppingCart, color: "text-blue-400" },
          { label: "Active Users", value: uniqueUsers, icon: Users, color: "text-purple-400" },
          { label: "Books Sold", value: totalBooksSold, icon: BookOpen, color: "text-primary" },
        ].map(c => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{c.value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* CHARTS */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Revenue Over Time</CardTitle></CardHeader>
          <CardContent>
            {revenueOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`৳${v.toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-10">No data</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-blue-400" /> Revenue by Format</CardTitle></CardHeader>
          <CardContent>
            {revenueByFormat.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={revenueByFormat} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ৳${value.toLocaleString()}`}>
                    {revenueByFormat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`৳${v.toLocaleString()}`, "Revenue"]} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-10">No data</p>}
          </CardContent>
        </Card>
      </div>

      {/* Top Books Bar Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Top Selling Books</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportCSV(bookSales.slice(0, 10), "top-books")}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {bookSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={bookSales.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis dataKey="title" type="category" width={150} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`৳${v.toLocaleString()}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-10">No data</p>}
        </CardContent>
      </Card>

      {/* TABS: Detailed Reports */}
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
          <TabsTrigger value="books">Book-wise Sales</TabsTrigger>
          <TabsTrigger value="creators">Creator Earnings</TabsTrigger>
          <TabsTrigger value="readers">Top Readers</TabsTrigger>
        </TabsList>

        {/* SALES REPORT */}
        <TabsContent value="sales">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Daily Sales (Last 30 days)</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(dailySales, "daily-sales")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailySales.length > 0 ? dailySales.map(d => (
                      <TableRow key={d.date}>
                        <TableCell className="text-sm">{d.date}</TableCell>
                        <TableCell className="text-right text-sm">{d.count}</TableCell>
                        <TableCell className="text-right text-sm font-medium">৳{d.revenue.toLocaleString()}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No sales data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOOK-WISE SALES */}
        <TabsContent value="books">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Book-wise Sales</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(bookSales, "book-sales")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Book</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">eBook</TableHead>
                      <TableHead className="text-right">Audio</TableHead>
                      <TableHead className="text-right">Hardcopy</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookSales.length > 0 ? bookSales.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">{b.title}</TableCell>
                        <TableCell className="text-right text-sm">{b.sales}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">৳{b.ebook.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">৳{b.audiobook.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">৳{b.hardcopy.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-green-400">৳{b.revenue.toLocaleString()}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CREATOR EARNINGS */}
        <TabsContent value="creators">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Creator Earnings</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(creatorEarnings.map(e => ({ name: profileMap[e.user_id] || e.user_id.slice(0, 8), role: e.role, total: e.total, paid: e.paid, pending: e.pending })), "creator-earnings")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creator</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creatorEarnings.length > 0 ? creatorEarnings.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium">{profileMap[e.user_id] || e.user_id.slice(0, 8)}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize text-[10px]">{e.role}</Badge></TableCell>
                        <TableCell className="text-right text-sm font-medium">৳{e.total.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-green-400">৳{e.paid.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-yellow-400">৳{e.pending.toLocaleString()}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No earnings data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TOP READERS */}
        <TabsContent value="readers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Top Readers / Buyers</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(topReaders.map(r => ({ name: profileMap[r.user_id] || r.user_id.slice(0, 8), orders: r.orders, spent: r.spent })), "top-readers")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Total Spent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topReaders.length > 0 ? topReaders.map((r, i) => (
                      <TableRow key={r.user_id}>
                        <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{profileMap[r.user_id] || r.user_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-right text-sm">{r.orders}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-green-400">৳{r.spent.toLocaleString()}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
