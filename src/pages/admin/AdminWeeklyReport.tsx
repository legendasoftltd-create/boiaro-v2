import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Users, DollarSign, BookOpen, Headphones, BookCopy, ShieldCheck, Activity, PlayCircle, Clock, CheckCircle, AlertTriangle, Bell, Coffee, Zap, Trophy } from "lucide-react";
import { useRef } from "react";

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

  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current;
    const printWindow = window.open('', '_blank');

    // Tailwind and Print Styles
    printWindow.document.write(`
      <html>
        <head>
          <title>Top 5 Books Report</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              .no-print { display: none; }
              body { padding: 20px; }
              * { -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Give it a moment to render styles before printing
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 700);
  };

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
        <h1 className="text-2xl font-bold text-black">
          Weekly Report
        </h1>

        <button className="bg-[#017B51] text-white px-4 py-2 rounded-md hover:bg-[#015a3a] transition"
          onClick={handlePrint}
          title="Print Table"
        >
          Print
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* top books  */}
        <div ref={printRef} className="w-full overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {/* Header Section */}
          <div className="p-6 flex items-center justify-between bg-[#017B51]">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600 shadow-sm">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-white text-lg font-black tracking-tight leading-none">Top 5 Books</h2>
                <p className="text-[10px] text-white font-bold uppercase tracking-widest mt-1">Reader's Choice</p>
              </div>
            </div>
            <div className="p-2 bg-yellow-50 rounded-full">
              <Trophy className="w-5 h-5 text-yellow-500" />
            </div>
          </div>

          {/* Table Section */}
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.15em]">
                  <th className="pb-2 pl-6 w-[70px]">Rank</th>
                  <th className="pb-2">Book Details</th>
                  <th className="pb-2 pr-6 text-right">Engagement</th>
                </tr>
              </thead>

              <tbody>
                {d?.topBooks?.map((b, i) => (
                  <tr
                    key={i}
                    className="group hover:bg-gray-100 transition-all duration-300"
                  >
                    {/* Rank with Circle */}
                    <td className="py-4 pl-6">
                      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-50 text-gray-900 font-black text-sm group-hover:bg-[#017B51] group-hover:text-white transition-all duration-300 shadow-sm">
                        {i + 1}
                      </span>
                    </td>

                    {/* Book Title with Subtext */}
                    <td className="py-4">
                      <div className="text-black font-bold tracking-tight text-lg group-hover:text-[#017B51] transition-colors">
                        {b.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">Trending Now</span>
                      </div>
                    </td>

                    {/* Reads with Badge Style */}
                    <td className="py-4 pr-6 text-right">
                      <div className="inline-flex flex-col items-end">
                        <span className="font-mono font-black text-black text-base">
                          {b.reads?.toLocaleString() ?? "0"}
                        </span>
                        <span className="text-[9px] text-gray-800 font-bold uppercase tracking-tighter">Reads</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="grid  grid-cols-1 lg:grid-cols-2 gap-3">
            {/* new user card  */}
            <div className="w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans">
              {/* Upper Section: Icon and Label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="text-[#FF8904]">
                  <Users size={24} strokeWidth={2.5} />
                </div>
                <span className="text-[#FF8904] font-bold tracking-wider text-sm">
                  New Users
                </span>
              </div>

              {/* Lower Section: Number */}
              <div className="text-2xl font-black text-[#FF8904]">
                {d.newUsers}
              </div>
            </div>

            {/* Revenue card */}
            <div className="w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans">
              {/* Upper Section: Icon and Label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="">
                  <span className="text-2xl font-bold text-[#017B51]">৳</span>
                </div>
                <span className="text-[#017B51] font-bold tracking-wider text-sm">
                  Revenue ({d.totalOrders} orders)
                </span>
              </div>

              {/* Lower Section: Number */}
              <div className="text-2xl font-black text-[#017B51]">
                {d.totalRevenue.toLocaleString()}
              </div>
            </div>

            {/* eBook Reading */}
            <div className="w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans">
              {/* Upper Section: Icon and Label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="text-[#E20057]">
                  <BookOpen size={24} strokeWidth={2.5} />
                </div>
                <span className="text-[#E20057] font-bold tracking-wider text-sm">
                  eBook Reading
                </span>
              </div>

              {/* Lower Section: Number */}
              <div className="text-2xl font-black text-[#E20057]">
                {d.ebookHours}h
              </div>
            </div>


            {/* Audiobook Listening */}
            <div className="w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans">
              {/* Upper Section: Icon and Label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="text-[#E200C4]">
                  <Headphones size={24} strokeWidth={2.5} />
                </div>
                <span className="text-[#E200C4] font-bold tracking-wider text-sm">
                  Audiobook Listening
                </span>
              </div>

              {/* Lower Section: Number */}
              <div className="text-2xl font-black text-[#E200C4]">
                {d.audioHours}h
              </div>
            </div>

            {/* Total Income */}
            <div className="w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans">
              {/* Upper Section: Icon and Label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="">
                  <span className="text-2xl font-bold text-[#017B51]">৳</span>
                </div>
                <span className="text-[#017B51] font-bold tracking-wider text-sm">
                  Total Income
                </span>
              </div>

              {/* Lower Section: Number */}
              <div className="text-2xl font-black text-[#017B51]">
                {d.income.toLocaleString()}
              </div>
            </div>



            {/* Total Expense  */}
            <div className="w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans">
              {/* Upper Section: Icon and Label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="">
                  <span className="text-2xl font-bold text-red-500">৳</span>
                </div>
                <span className="text-red-500 font-bold tracking-wider text-sm">
                  Total Expense
                </span>
              </div>

              {/* Lower Section: Number */}
              <div className="text-2xl font-black text-red-500">
                {d.expense.toLocaleString()}
              </div>
            </div>

            






          </div>



          {/* Net Profit  */}
            <div className="w-full p-6 bg-white border border-gray-400 rounded-2xl shadow-sm font-sans mt-4">
              {/* Upper Section: Icon and Label */}
              <div className="flex items-center gap-3 mb-4">
                <div className="">
                  <span className="text-2xl font-bold text-[#017B51]">৳</span>
                </div>
                <span className="text-[#017B51] font-bold tracking-wider text-sm">
                  Net Profit
                </span>
              </div>

              {/* Lower Section: Number */}
              <div className="text-2xl font-black text-[#017B51]">
                {d.netProfit.toLocaleString()}
              </div>
            </div>




        </div>
      </div>









     




      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* Total Alerts Card */}
        <div className="bg-white border border-gray-400 rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3 text-blue-600">
            <Bell size={20} strokeWidth={2.5} />
            <span className="text-[10px] font-bold tracking-widest uppercase">Total Alerts</span>
          </div>
          <div className="text-2xl font-black text-gray-900">{d.alertsTotal}</div>
        </div>

        {/* Critical Card */}
        <div className="bg-white border border-gray-400 rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3 text-red-500">
            <AlertTriangle size={20} strokeWidth={2.5} />
            <span className="text-[10px] font-bold tracking-widest uppercase">Critical</span>
          </div>
          <div className="text-2xl font-black text-gray-900">{d.alertsCritical}</div>
        </div>

        {/* Resolved Card */}
        <div className="bg-white border border-gray-400 rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3 text-emerald-500">
            <CheckCircle size={20} strokeWidth={2.5} />
            <span className="text-[10px] font-bold tracking-widest uppercase">Resolved</span>
          </div>
          <div className="text-2xl font-black text-gray-900">{d.alertsResolved}</div>
        </div>

        {/* Unresolved Card */}
        <div className="bg-white border border-gray-400 rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3 text-amber-500">
            <Clock size={20} strokeWidth={2.5} />
            <span className="text-[10px] font-bold tracking-widest uppercase">Unresolved</span>
          </div>
          <div className="text-2xl font-black text-gray-900">{d.alertsUnresolved}</div>
        </div>
      </div>

 {/* database health status  */}
      <div className="bg-white border border-gray-400 rounded-2xl shadow-sm overflow-hidden">

        {/* Header Section (Based on your image style) */}
        <div className="p-5 border-b border-gray-50">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-blue-600">
              <Activity size={22} strokeWidth={2.5} />
            </div>
            <span className="text-blue-600 font-bold tracking-widest text-xs uppercase">
              DB Health Status
            </span>
          </div>

          {/* Main Saturation Value */}
          <div className="flex justify-center gap-2">
            <span className="text-5xl font-black text-black text-center">{(d.pool as any)?.saturation_pct ?? "—"}</span>
            <span className="text-2xl font-bold text-black">%</span>
          </div>
          <p className="text-xs text-black mt-1 font-medium">Connection Saturation</p>
        </div>

        {/* Stats Grid (Active & Idle) */}
        <div className="grid grid-cols-2 divide-x divide-gray-50 bg-gray-50/50">
          {/* Active Connections */}
          <div className="p-4 flex items-center justify-center gap-3">
            <Zap size={16} className="text-amber-500" />
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-black">Active</p>
              <p className="text-xl font-black text-black font-mono">{(d.pool as any)?.active ?? "—"}</p>
            </div>
          </div>

          {/* Idle Connections */}
          <div className="p-4 flex items-center justify-center gap-3">
            <Coffee size={16} className="text-emerald-500" />
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-black">Idle</p>
              <p className="text-xl font-black text-black font-mono">{(d.pool as any)?.idle ?? "—"}</p>
            </div>
          </div>
        </div>
      </div>



    </div>
  );
}
