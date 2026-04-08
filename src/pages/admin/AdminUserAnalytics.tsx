import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, Headphones, RefreshCw, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

export default function AdminUserAnalytics() {
  // DAU — unique users with activity per day (last 30 days)
  const { data: dauData = [], refetch: refetchDau } = useQuery({
    queryKey: ["admin-dau"],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_consumption_time")
        .select("user_id, session_date")
        .gte("session_date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
      if (!data) return [];
      const byDate: Record<string, Set<string>> = {};
      data.forEach(r => {
        if (!byDate[r.session_date]) byDate[r.session_date] = new Set();
        byDate[r.session_date].add(r.user_id);
      });
      return Object.entries(byDate).map(([date, users]) => ({ date, users: users.size })).sort((a, b) => a.date.localeCompare(b.date));
    },
    staleTime: 60_000,
  });

  // Format breakdown
  const { data: formatData = [] } = useQuery({
    queryKey: ["admin-format-usage"],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_consumption_time")
        .select("format, duration_seconds")
        .gte("session_date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
      if (!data) return [];
      const byFormat: Record<string, number> = {};
      data.forEach(r => {
        byFormat[r.format] = (byFormat[r.format] || 0) + r.duration_seconds;
      });
      return Object.entries(byFormat).map(([name, value]) => ({ name, value: Math.round(value / 3600) }));
    },
    staleTime: 60_000,
  });

  // Online users (from user_presence)
  const { data: onlineCount = 0 } = useQuery({
    queryKey: ["admin-online-users"],
    queryFn: async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
      const { count } = await supabase
        .from("user_presence")
        .select("*", { count: "exact", head: true })
        .gte("last_seen", fiveMinAgo);
      return count || 0;
    },
    refetchInterval: 30_000,
  });

  // Total registered users
  const { data: totalUsers = 0 } = useQuery({
    queryKey: ["admin-total-users"],
    queryFn: async () => {
      const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      return count || 0;
    },
    staleTime: 120_000,
  });

  // Reads last 7 days
  const { data: readsData = [] } = useQuery({
    queryKey: ["admin-reads-7d"],
    queryFn: async () => {
      const { data } = await supabase
        .from("book_reads")
        .select("created_at")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      if (!data) return [];
      const byDate: Record<string, number> = {};
      data.forEach(r => {
        const d = r.created_at.slice(0, 10);
        byDate[d] = (byDate[d] || 0) + 1;
      });
      return Object.entries(byDate).map(([date, count]) => ({ date: date.slice(5), reads: count })).sort((a, b) => a.date.localeCompare(b.date));
    },
    staleTime: 60_000,
  });

  const todayDau = dauData.length > 0 ? dauData[dauData.length - 1]?.users ?? 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> User Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Real user engagement & retention metrics</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchDau()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Users className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold">{totalUsers.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total Users</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-green-500 mb-1" />
          <p className="text-2xl font-bold">{todayDau}</p>
          <p className="text-xs text-muted-foreground">Today's DAU</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-2 animate-pulse" />
          <p className="text-2xl font-bold">{onlineCount}</p>
          <p className="text-xs text-muted-foreground">Online Now</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <BookOpen className="w-5 h-5 mx-auto text-amber-500 mb-1" />
          <p className="text-2xl font-bold">{readsData.reduce((s, r) => s + r.reads, 0)}</p>
          <p className="text-xs text-muted-foreground">Reads (7d)</p>
        </CardContent></Card>
      </div>

      {/* DAU Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Daily Active Users (30 days)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dauData}>
                <XAxis dataKey="date" tickFormatter={d => d.slice(5)} fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Format Usage */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Headphones className="w-4 h-4" /> Content Format Usage (hours, 30d)
          </CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={formatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}h`}>
                    {formatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Reading Activity */}
        <Card>
          <CardHeader><CardTitle className="text-base">Reading Activity (7 days)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={readsData}>
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Line type="monotone" dataKey="reads" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
