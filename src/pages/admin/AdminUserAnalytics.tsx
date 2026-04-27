import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, Headphones, RefreshCw, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

export default function AdminUserAnalytics() {
  const utils = trpc.useUtils();
  const { data } = trpc.admin.userEngagementAnalytics.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const dauData = data?.dauData || [];
  const formatData = data?.formatData || [];
  const onlineCount = data?.onlineCount || 0;
  const totalUsers = data?.totalUsers || 0;
  const readsData = data?.readsData || [];
  const refetchDau = () => utils.admin.userEngagementAnalytics.invalidate();

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
