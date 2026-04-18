import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Users, DollarSign, BookOpen, Headphones, BookCopy, ShieldCheck, Activity } from "lucide-react";

function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: now.toISOString(), label: `${start.toLocaleDateString()} — ${now.toLocaleDateString()}` };
}

export default function AdminWeeklyReport() {
  const week = getWeekRange();

  const { data, isLoading } = useQuery({
    queryKey: ["weekly-report", week.start],
    queryFn: async () => {
      const [
        newUsers, weekOrders, weekLedger, topBooksRes,
        consumptionRes, alertsRes, poolRes,
      ] = await Promise.all([
        supabase.from("profiles").select("user_id", { count: "exact", head: true }).gte("created_at", week.start),
        supabase.from("orders").select("total_amount, status, created_at").gte("created_at", week.start).in("status", ["paid", "confirmed", "completed", "access_granted", "delivered"]),
        supabase.from("accounting_ledger" as any).select("type, amount, category").gte("entry_date", week.start.split("T")[0]),
        supabase.from("books").select("title, total_reads").order("total_reads", { ascending: false }).limit(5),
        supabase.from("content_consumption_time").select("format, duration_seconds").gte("session_date", week.start.split("T")[0]),
        supabase.from("system_alerts").select("id, severity, is_resolved").gte("created_at", week.start),
        supabase.rpc("get_connection_pool_stats"),
      ]);

      const ledger = (weekLedger.data as any[]) || [];
      const income = ledger.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + Number(e.amount), 0);
      const expense = ledger.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);

      const consumption = consumptionRes.data || [];
      const ebookHours = consumption.filter((c: any) => c.format === "ebook").reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 3600;
      const audioHours = consumption.filter((c: any) => c.format === "audiobook").reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 3600;

      const alerts = alertsRes.data || [];

      return {
        newUsers: newUsers.count || 0,
        totalOrders: (weekOrders.data || []).length,
        totalRevenue: (weekOrders.data || []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0),
        income, expense, netProfit: income - expense,
        topBooks: (topBooksRes.data || []).map((b: any) => ({ title: b.title, reads: b.total_reads || 0 })),
        ebookHours: ebookHours.toFixed(1),
        audioHours: audioHours.toFixed(1),
        alertsTotal: alerts.length,
        alertsCritical: alerts.filter((a: any) => a.severity === "critical").length,
        alertsResolved: alerts.filter((a: any) => a.is_resolved).length,
        alertsUnresolved: alerts.filter((a: any) => !a.is_resolved).length,
        pool: poolRes.data,
      };
    },
  });

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-8 w-64 bg-muted rounded" /><div className="h-40 bg-muted rounded-lg" /></div>;

  const d = data!;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Weekly Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{week.label}</p>
        </div>
        <Badge variant="outline" className="text-xs">Auto-generated</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 text-purple-400 mx-auto mb-1" />
          <p className="text-2xl font-bold">{d.newUsers}</p>
          <p className="text-xs text-muted-foreground">New Users</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
          <p className="text-2xl font-bold">৳{d.totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Revenue ({d.totalOrders} orders)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <BookCopy className="h-5 w-5 text-blue-400 mx-auto mb-1" />
          <p className="text-2xl font-bold">{d.ebookHours}h</p>
          <p className="text-xs text-muted-foreground">eBook Reading</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Headphones className="h-5 w-5 text-cyan-400 mx-auto mb-1" />
          <p className="text-2xl font-bold">{d.audioHours}h</p>
          <p className="text-xs text-muted-foreground">Audiobook Listening</p>
        </CardContent></Card>
      </div>

      {/* Top Books */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" /> Top 5 Books</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Book</TableHead><TableHead className="text-right">Total Reads</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {d.topBooks.map((b: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                  <TableCell className="font-medium">{b.title}</TableCell>
                  <TableCell className="text-right font-mono">{b.reads.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /> Financial Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-lg font-bold text-emerald-400">৳{d.income.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Income</p></div>
            <div><p className="text-lg font-bold text-red-400">৳{d.expense.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Expense</p></div>
            <div><p className={`text-lg font-bold ${d.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>৳{d.netProfit.toLocaleString()}</p><p className="text-xs text-muted-foreground">Net Profit</p></div>
          </div>
        </CardContent>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> System Health Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-lg font-bold">{d.alertsTotal}</p>
              <p className="text-xs text-muted-foreground">Total Alerts</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${d.alertsCritical > 0 ? "text-destructive" : "text-emerald-400"}`}>{d.alertsCritical}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-400">{d.alertsResolved}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${d.alertsUnresolved > 0 ? "text-amber-400" : "text-emerald-400"}`}>{d.alertsUnresolved}</p>
              <p className="text-xs text-muted-foreground">Unresolved</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            <div className="text-sm">
              <span className="font-medium">DB Health: </span>
              Connection saturation: <span className="font-mono font-bold">{(d.pool as any)?.saturation_pct ?? "—"}%</span>
              {" · "}Active: <span className="font-mono">{(d.pool as any)?.active ?? "—"}</span>
              {" · "}Idle: <span className="font-mono">{(d.pool as any)?.idle ?? "—"}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
