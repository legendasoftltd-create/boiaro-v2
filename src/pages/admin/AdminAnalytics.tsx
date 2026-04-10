import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  CalendarIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Area, AreaChart,
} from "recharts";
import { format } from "date-fns";
import { isVerifiedRevenueOrder, isInDateRange, type RevenueOrder } from "@/hooks/useUnifiedRevenue";
import SummaryCard from "@/components/admin/SummaryCard";

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
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; name_bn?: string }[]>([]);
  const [_authors, setAuthors] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; display_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [ordersRes, itemsRes, earningsRes, catsRes, authorsRes, profilesRes] = await Promise.all([
      supabase.from("orders").select("id, user_id, total_amount, status, created_at, coupon_code, discount_amount, shipping_cost, payment_method, cod_payment_status"),
      supabase.from("order_items").select("order_id, format, unit_price, quantity, book_id, books(title, author_id, publisher_id, category_id)"),
      supabase.from("contributor_earnings").select("user_id, role, earned_amount, status, book_id, format"),
      supabase.from("categories").select("id, name, name_bn"),
      supabase.from("authors").select("id, name"),
      supabase.from("profiles").select("user_id, display_name"),
    ]);
    setOrders(ordersRes.data || []);
    setOrderItems((itemsRes.data || []) as unknown as OrderItem[]);
    setEarnings((earningsRes.data || []) as unknown as EarningRow[]);
    setCategories(catsRes.data || []);
    setAuthors(authorsRes.data || []);
    setProfiles(profilesRes.data || []);
    setLoading(false);
  };

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
      
      <h1 className="text-2xl font-bold text-black"> Analytics </h1>

      {/* FILTERS */}
     
<Card className="border-0 shadow-sm bg-white/90 backdrop-blur-sm p-2 py-8">
  <>
    <div className="flex flex-wrap gap-4 items-end">
      

    <div className="flex-1 min-w-[140px]">
      <label className="text-lg font-bold text-black mb-1.5 block">From</label>
      <div className="relative">
        <Input 
          type="date" 
          value={dateFrom} 
          onChange={e => setDateFrom(e.target.value)} 
          className="w-full h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all bg-[#017B51] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
        />
        <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-white pointer-events-none" size={18} />
      </div>
    </div>


      <div className="flex-1 min-w-[140px]">
        <label className="text-lg font-bold text-black mb-1.5 block">To</label>
        <div className="relative">
          <Input 
            type="date" 
            value={dateTo} 
            onChange={e => setDateTo(e.target.value)} 
            className="w-full h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all bg-[#017B51] text-white [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
          />
          <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-white pointer-events-none" size={18} />
        </div>
      </div>
      
      <div className="flex-1 min-w-[130px]">
        <label className="text-lg font-bold text-black mb-1.5 block">Format</label>
        <Select value={formatFilter} onValueChange={setFormatFilter}>
          <SelectTrigger className="w-full h-10 border-gray-200 bg-[#017B51] ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ backgroundColor: "#017B51" }}>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="ebook">eBook</SelectItem>
            <SelectItem value="audiobook">Audiobook</SelectItem>
            <SelectItem value="hardcopy">Hard Copy</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex-1 min-w-[150px]">
        <label className="text-lg font-bold text-black mb-1.5 block">Category</label>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full h-10 border-gray-200 bg-[#017B51]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ backgroundColor: "#017B51" }}>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_bn || c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex-shrink-0">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => { setDateFrom(""); setDateTo(""); setFormatFilter("all"); setCategoryFilter("all"); }}
          className="h-10 px-4 hover:text-white  bg-red-500 text-white hover:bg-red-700 transition-all"
        >
          Clear All
        </Button>
      </div>
    </div>
  </>
</Card>


    {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Verified Order Revenue", value: `${totalRevenue.toLocaleString()}`, icon: '', color: "green" },
          { label: "Total Orders", value: totalOrdersCount, icon: ShoppingCart, color: "blue" },
          { label: "Active Users", value: uniqueUsers, icon: Users, color: "purple" },
          { label: "Books Sold", value: totalBooksSold, icon: BookOpen, color: "orange" },
        ].map(c => (
          <> 
          {/* <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{c.value}</div></CardContent>
          </Card> */}
          <SummaryCard
              icon={c.icon}
              title={c.label}
              value={c.value}
              color={c.color}
            />
          </>
        ))}
      </div>


  {/*  Detailed Reports */}
  <Tabs defaultValue="sales" className="space-y-6">

    {/* Tabs */}
    <TabsList className="flex flex-wrap gap-2 bg-transparent p-0">
      {["sales","books","creators","readers"].map(tab => (
        <TabsTrigger
          key={tab}
          value={tab}
          className="px-4 py-2 text-sm rounded-xl border border-black text-zinc-400 
          data-[state=active]:bg-[#017B51] data-[state=active]:text-white text-black  
          hover:bg-[#017B51] transition-all data-[state=active]:border-[#017B51] hover:text-white hover:border-white"
        >
          {tab === "sales" && "Sales Report"}
          {tab === "books" && "Book-wise Sales"}
          {tab === "creators" && "Creator Earnings"}
          {tab === "readers" && "Top Readers"}
        </TabsTrigger>
      ))}
    </TabsList>

    {/* SALES */}
    <TabsContent value="sales">
      <div className="bg-zinc-950 rounded-2xl shadow-lg">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#017B51] rounded-tl-2xl rounded-tr-2xl">
          <h2 className="text-sm font-semibold text-zinc-200">
            Daily Sales (Last 30 days)
          </h2>
          <button onClick={() => exportCSV(dailySales, "daily-sales")} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-white rounded-lg text-zinc-300 hover:bg-[#1FCE75] hover:border-[#1FCE75]">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-black text-xs">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-right px-4 py-3">Orders</th>
                <th className="text-right px-4 py-3">Revenue</th>
              </tr>
            </thead>

            <tbody>
              {dailySales.length > 0 ? dailySales.map((d, i) => (
                <tr key={d.date} className="border-t border-zinc-800 bg-white text-black hover:bg-gray-200 transition">
                  <td className="px-4 py-3">{d.date}</td>
                  <td className="px-4 py-3 text-right">{d.count}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#017B51]">
                    ৳ {d.revenue.toLocaleString()}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-zinc-500">
                    No sales data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </TabsContent>

    {/* BOOKS */}
    <TabsContent value="books">
      <div className="bg-zinc-950 rounded-2xl shadow-lg">
        
        <div className="flex items-center justify-between px-5 py-4 bg-[#017B51] rounded-tl-2xl rounded-tr-2xl">
          <h2 className="text-sm font-semibold text-zinc-200">Book-wise Sales</h2>
          <button onClick={() => exportCSV(bookSales, "book-sales")} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-white rounded-lg text-zinc-300 hover:bg-[#1FCE75] hover:border-[#1FCE75]">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>

        <div className="overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-black text-xs">
                <th className="text-left px-4 py-3">Book</th>
                <th className="text-right px-4 py-3">Units</th>
                <th className="text-right px-4 py-3">eBook</th>
                <th className="text-right px-4 py-3">Audio</th>
                <th className="text-right px-4 py-3">Hardcopy</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>

            <tbody>
              {bookSales.length > 0 ? bookSales.map((b, i) => (
                <tr key={i} className="border-t border-zinc-800 bg-white text-black hover:bg-gray-200 transition">
                  <td className="px-4 py-3 max-w-[220px] truncate font-medium">{b.title}</td>
                  <td className="px-4 py-3 text-right">{b.sales}</td>
                  <td className="px-4 py-3 text-right text-black">৳{b.ebook.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-black">৳{b.audiobook.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-black">৳{b.hardcopy.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#017B51]">৳{b.revenue.toLocaleString()}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-zinc-500">No data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </TabsContent>

    {/*  creators  */}
    <TabsContent value="creators">
    <div className="bg-zinc-950 rounded-2xl shadow-lg">
      
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#017B51] rounded-tl-2xl rounded-tr-2xl">
        <h2 className="text-sm font-semibold text-zinc-200">
          Creator Earnings
        </h2>

        <button
          onClick={() =>
            exportCSV(
              creatorEarnings.map(e => ({
                name: profileMap[e.user_id] || e.user_id.slice(0, 8),
                role: e.role,
                total: e.total,
                paid: e.paid,
                pending: e.pending
              })),
              "creator-earnings"
            )
          }
          className="flex items-center gap-1 text-xs px-3 py-1.5 border border-white rounded-lg text-zinc-300 hover:bg-[#1FCE75] hover:border-[#1FCE75]"
        >
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-sm">
          
          <thead className="sticky top-0 bg-white">
            <tr className="text-black text-xs">
              <th className="text-left px-4 py-3">Creator</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Paid</th>
              <th className="text-right px-4 py-3">Pending</th>
            </tr>
          </thead>

          <tbody>
            {creatorEarnings.length > 0 ? creatorEarnings.map((e, i) => (
              <tr
                key={i}
                className="border-t border-zinc-800 bg-white text-black hover:bg-gray-200 transition"
              >
                <td className="px-4 py-3 font-medium text-black">
                  {profileMap[e.user_id] || e.user_id.slice(0, 8)}
                </td>

                <td className="px-4 py-3">
                  <span className="text-[11px] px-2 py-1 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 capitalize">
                    {e.role}
                  </span>
                </td>

                <td className="px-4 py-3 text-right font-medium">
                  ৳{e.total.toLocaleString()}
                </td>

                <td className="px-4 py-3 text-right text-green-400">
                  ৳{e.paid.toLocaleString()}
                </td>

                <td className="px-4 py-3 text-right text-yellow-400">
                  ৳{e.pending.toLocaleString()}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="text-center py-6 text-zinc-500">
                  No earnings data
                </td>
              </tr>
            )}
          </tbody>

        </table>
      </div>

    </div>
  </TabsContent>

  {/* READERS */}
  <TabsContent value="readers">
    <div className="bg-zinc-950 rounded-2xl shadow-lg">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-[#017B51] rounded-tl-2xl rounded-tr-2xl">
        <h2 className="text-sm font-semibold text-zinc-200">
          Top Readers / Buyers
        </h2>

        <button
          onClick={() =>
            exportCSV(
              topReaders.map(r => ({
                name: profileMap[r.user_id] || r.user_id.slice(0, 8),
                orders: r.orders,
                spent: r.spent
              })),
              "top-readers"
            )
          }
          className="flex items-center gap-1 text-xs px-3 py-1.5 border border-white rounded-lg text-zinc-300 hover:bg-[#1FCE75] hover:border-[#1FCE75]"
        >
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-sm">

          <thead className="sticky top-0 bg-white">
            <tr className="text-black text-xs">
              <th className="text-left px-4 py-3">#</th>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-right px-4 py-3">Orders</th>
              <th className="text-right px-4 py-3">Total Spent</th>
            </tr>
          </thead>

          <tbody>
            {topReaders.length > 0 ? topReaders.map((r, i) => (
              <tr
                key={r.user_id}
                className="border-t border-zinc-800 bg-white text-black hover:bg-gray-200 transition"
              >
                <td className="px-4 py-3 text-black">{i + 1}</td>

                <td className="px-4 py-3 font-medium text-black">
                  {profileMap[r.user_id] || r.user_id.slice(0, 8)}
                </td>

                <td className="px-4 py-3 text-right">
                  {r.orders}
                </td>

                <td className="px-4 py-3 text-right font-semibold text-[#017B51]">
                  ৳{r.spent.toLocaleString()}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="text-center py-6 text-zinc-500">
                  No data
                </td>
              </tr>
            )}
          </tbody>

        </table>
      </div>

    </div>
  </TabsContent>

  </Tabs>

    <div className="grid md:grid-cols-2 gap-6">

            <Card style={{backgroundColor:'#c94364'}}>
              <CardHeader><CardTitle className="text-base flex items-center gap-2 mb-3"><PieChartIcon className="h-4 w-4 text-blue-400" /> Revenue by Format</CardTitle></CardHeader>
              <CardContent>
                {revenueByFormat.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240} >
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

            <Card style={{backgroundColor:'#F68B1E'}}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-white" /> Top Selling Books</CardTitle>
                <Button variant="outline" size="sm" className="bg-[#017B51] hover:text-white border-white hover:bg-[#1FCE75]" onClick={() => exportCSV(bookSales.slice(0, 10), "top-books")}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {bookSales.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={bookSales.slice(0, 10)} layout="vertical" margin={{ top: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="title" type="category" width={150} tick={{ fontSize: 10, fill: "white" }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`৳${v.toLocaleString()}`, "Revenue"]} />
                      <Bar dataKey="revenue" fill="#017B51" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-10">No data</p>}
              </CardContent>
            </Card>
    </div>


 {/* Top Books Bar Chart */}
      

      {/* CHARTS */}
      <div className="grid grid-cols-1 gap-6">
        <Card style={{backgroundColor:'#0e351d'}}>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Revenue Over Time</CardTitle></CardHeader>
          <CardContent>
            {revenueOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="white" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#F68B1E" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#F68B1E" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`৳${v.toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-10">No data</p>}
          </CardContent>
        </Card>

        
      </div>

     





    </div>
  );
}
