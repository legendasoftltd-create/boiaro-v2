import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, RefreshCw, TrendingUp, BookOpen, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

export default function AdminRevenueDashboard() {
  // Daily revenue (last 30 days from accounting_ledger)
  const { data: dailyRevenue = [], refetch } = useQuery({
    queryKey: ["admin-daily-revenue"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("accounting_ledger")
        .select("entry_date, amount, type")
        .eq("type", "income")
        .gte("entry_date", thirtyDaysAgo)
        .order("entry_date", { ascending: true });
      if (!data) return [];
      const byDate: Record<string, number> = {};
      data.forEach(r => {
        byDate[r.entry_date] = (byDate[r.entry_date] || 0) + r.amount;
      });
      return Object.entries(byDate).map(([date, amount]) => ({ date, amount: Math.round(amount) }));
    },
    staleTime: 60_000,
  });

  // Revenue by format (from order_items)
  const { data: formatRevenue = [] } = useQuery({
    queryKey: ["admin-format-revenue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("format, price, quantity, orders!inner(status)")
        .in("orders.status", ["paid", "completed", "access_granted", "delivered"]);
      if (!data) return [];
      const byFormat: Record<string, number> = {};
      data.forEach((r: any) => {
        const total = (r.price || 0) * (r.quantity || 1);
        byFormat[r.format] = (byFormat[r.format] || 0) + total;
      });
      return Object.entries(byFormat).map(([name, value]) => ({ name, value: Math.round(value) }));
    },
    staleTime: 120_000,
  });

  // Top books by revenue
  const { data: topBooks = [] } = useQuery({
    queryKey: ["admin-top-books-revenue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("book_id, price, quantity, books!inner(title), orders!inner(status)")
        .in("orders.status", ["paid", "completed", "access_granted", "delivered"]);
      if (!data) return [];
      const byBook: Record<string, { title: string; revenue: number }> = {};
      data.forEach((r: any) => {
        const rev = (r.price || 0) * (r.quantity || 1);
        if (!byBook[r.book_id]) byBook[r.book_id] = { title: r.books?.title || "Unknown", revenue: 0 };
        byBook[r.book_id].revenue += rev;
      });
      return Object.values(byBook).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    },
    staleTime: 120_000,
  });

  // Top spending users
  const { data: topUsers = [] } = useQuery({
    queryKey: ["admin-top-spenders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("user_id, total_amount, profiles!inner(display_name)")
        .in("status", ["paid", "completed", "access_granted", "delivered"]);
      if (!data) return [];
      const byUser: Record<string, { name: string; spent: number }> = {};
      data.forEach((r: any) => {
        if (!byUser[r.user_id]) byUser[r.user_id] = { name: r.profiles?.display_name || "User", spent: 0 };
        byUser[r.user_id].spent += r.total_amount || 0;
      });
      return Object.values(byUser).sort((a, b) => b.spent - a.spent).slice(0, 10);
    },
    staleTime: 120_000,
  });

  const totalRevenue = dailyRevenue.reduce((s, d) => s + d.amount, 0);
  const todayRev = dailyRevenue.length > 0 ? dailyRevenue[dailyRevenue.length - 1]?.amount ?? 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" /> Revenue Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Income tracking & business metrics</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold">৳{totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">30-Day Revenue</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-green-500 mb-1" />
          <p className="text-2xl font-bold">৳{todayRev.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Today</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <BookOpen className="w-5 h-5 mx-auto text-amber-500 mb-1" />
          <p className="text-2xl font-bold">{topBooks.length}</p>
          <p className="text-xs text-muted-foreground">Revenue Books</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Users className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-2xl font-bold">{topUsers.length}</p>
          <p className="text-xs text-muted-foreground">Paying Users</p>
        </CardContent></Card>
      </div>

      {/* Daily Revenue Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Daily Income (30 days)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRevenue}>
                <XAxis dataKey="date" tickFormatter={d => d.slice(5)} fontSize={10} />
                <YAxis fontSize={10} tickFormatter={v => `৳${v}`} />
                <Tooltip formatter={(v: number) => [`৳${v}`, "Revenue"]} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Format Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Format</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={formatRevenue} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ৳${value}`}>
                    {formatRevenue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `৳${v}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Books */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top Books by Revenue</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topBooks.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate max-w-[200px]">{i + 1}. {b.title}</span>
                  <span className="font-mono font-medium">৳{b.revenue.toLocaleString()}</span>
                </div>
              ))}
              {topBooks.length === 0 && <p className="text-sm text-muted-foreground">No revenue data yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Spenders */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top Spending Users</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {topUsers.map((u, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-sm font-medium truncate">{u.name}</p>
                <p className="text-lg font-bold">৳{u.spent.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
