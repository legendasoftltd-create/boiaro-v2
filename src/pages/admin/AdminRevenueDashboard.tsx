import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, RefreshCw, TrendingUp, BookOpen, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { trpc } from "@/lib/trpc";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

export default function AdminRevenueDashboard() {
  const utils = trpc.useUtils();
  const { data, refetch } = useQuery({
    queryKey: ["admin-revenue-dashboard-data"],
    queryFn: () => utils.admin.revenueDashboardData.fetch(),
    staleTime: 60_000,
  });
  const dailyRevenue = data?.dailyRevenue || [];
  const formatRevenue = data?.formatRevenue || [];
  const topBooks = data?.topBooks || [];
  const topUsers = data?.topUsers || [];

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
