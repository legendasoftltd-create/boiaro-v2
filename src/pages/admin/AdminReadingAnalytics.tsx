import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LiveUsersModal, type LiveUserFilter } from "@/components/admin/LiveUsersModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from "recharts";
import {
  Eye, BookOpen, Users, Flame, Download, Loader2, BarChart3,
  Activity, Headphones, CalendarDays,
} from "lucide-react";
import { format, subDays } from "date-fns";



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

const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

interface ActivityLog {
  event_type: string;
  book_id: string | null;
  user_id: string;
  created_at: string;
  metadata: any;
}

interface BookInfo {
  id: string;
  title: string;
  total_reads: number;
  cover_url: string | null;
}

export default function AdminReadingAnalytics() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [bookReads, setBookReads] = useState<{ book_id: string; user_id: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendingPeriod, setTrendingPeriod] = useState("7");
  const [presenceData, setPresenceData] = useState<any[]>([]);
  const [liveFilter, setLiveFilter] = useState<LiveUserFilter>(null);

  useEffect(() => {
    const load = async () => {
      const [logsRes, booksRes, readsRes, presenceRes, settingsRes] = await Promise.all([
        supabase.from("user_activity_logs" as any).select("event_type, book_id, user_id, created_at, metadata").order("created_at", { ascending: false }).limit(5000),
        supabase.from("books").select("id, title, total_reads, cover_url"),
        supabase.from("book_reads").select("book_id, user_id, created_at"),
        supabase.from("user_presence" as any).select("*"),
        supabase.from("platform_settings").select("key, value").eq("key", "rec_trending_period_days"),
      ]);
      setLogs((logsRes.data as any[]) || []);
      setBooks((booksRes.data as any[]) || []);
      setBookReads((readsRes.data as any[]) || []);
      setPresenceData((presenceRes.data as any[]) || []);

      const period = (settingsRes.data || [])[0]?.value;
      if (period) setTrendingPeriod(period);

      setLoading(false);
    };
    load();
  }, []);

  const bookMap = useMemo(() => {
    const m: Record<string, BookInfo> = {};
    books.forEach(b => { m[b.id] = b; });
    return m;
  }, [books]);

  // ── DAILY READING REPORT ──
  const dailyReport = useMemo(() => {
    const last30 = subDays(new Date(), 30).toISOString();
    const filtered = logs.filter(l => l.created_at >= last30);
    const map: Record<string, { views: number; reads: number; uniqueUsers: Set<string>; ebook: number; audiobook: number }> = {};

    filtered.forEach(l => {
      const d = l.created_at.slice(0, 10);
      if (!map[d]) map[d] = { views: 0, reads: 0, uniqueUsers: new Set(), ebook: 0, audiobook: 0 };
      map[d].uniqueUsers.add(l.user_id);
      if (l.event_type === "book_view") map[d].views++;
      if (l.event_type === "reading_progress") { map[d].reads++; map[d].ebook++; }
      if (l.event_type === "listening_progress") { map[d].reads++; map[d].audiobook++; }
    });

    // Also count from book_reads
    const readsFiltered = bookReads.filter(r => r.created_at >= last30);
    readsFiltered.forEach(r => {
      const d = r.created_at.slice(0, 10);
      if (!map[d]) map[d] = { views: 0, reads: 0, uniqueUsers: new Set(), ebook: 0, audiobook: 0 };
      map[d].reads++;
      map[d].uniqueUsers.add(r.user_id);
    });

    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, d]) => ({ date, views: d.views, reads: d.reads, uniqueReaders: d.uniqueUsers.size, ebook: d.ebook, audiobook: d.audiobook }));
  }, [logs, bookReads]);

  // ── MONTHLY READING REPORT ──
  const monthlyReport = useMemo(() => {
    const map: Record<string, { views: number; reads: number; uniqueUsers: Set<string> }> = {};

    logs.forEach(l => {
      const m = l.created_at.slice(0, 7);
      if (!map[m]) map[m] = { views: 0, reads: 0, uniqueUsers: new Set() };
      map[m].uniqueUsers.add(l.user_id);
      if (l.event_type === "book_view") map[m].views++;
      if (["reading_progress", "listening_progress"].includes(l.event_type)) map[m].reads++;
    });

    bookReads.forEach(r => {
      const m = r.created_at.slice(0, 7);
      if (!map[m]) map[m] = { views: 0, reads: 0, uniqueUsers: new Set() };
      map[m].reads++;
      map[m].uniqueUsers.add(r.user_id);
    });

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, views: d.views, reads: d.reads, uniqueReaders: d.uniqueUsers.size }));
  }, [logs, bookReads]);

  // ── BOOK-WISE TOTAL VIEWS ──
  const bookViews = useMemo(() => {
    const viewLogs = logs.filter(l => l.event_type === "book_view" && l.book_id);
    const map: Record<string, { views: number; lastActivity: string }> = {};
    viewLogs.forEach(l => {
      if (!l.book_id) return;
      if (!map[l.book_id]) map[l.book_id] = { views: 0, lastActivity: l.created_at };
      map[l.book_id].views++;
      if (l.created_at > map[l.book_id].lastActivity) map[l.book_id].lastActivity = l.created_at;
    });

    return Object.entries(map)
      .sort((a, b) => b[1].views - a[1].views)
      .map(([bookId, d]) => ({
        bookId,
        title: bookMap[bookId]?.title || bookId.slice(0, 8),
        views: d.views,
        cachedReads: bookMap[bookId]?.total_reads || 0,
        lastActivity: d.lastActivity,
      }));
  }, [logs, bookMap]);

  // ── UNIQUE USERS PER BOOK ──
  const uniqueUsersPerBook = useMemo(() => {
    const map: Record<string, { readers: Set<string>; viewUsers: Set<string>; lastActivity: string }> = {};

    bookReads.forEach(r => {
      if (!map[r.book_id]) map[r.book_id] = { readers: new Set(), viewUsers: new Set(), lastActivity: r.created_at };
      map[r.book_id].readers.add(r.user_id);
      if (r.created_at > map[r.book_id].lastActivity) map[r.book_id].lastActivity = r.created_at;
    });

    logs.filter(l => l.event_type === "book_view" && l.book_id).forEach(l => {
      if (!l.book_id) return;
      if (!map[l.book_id]) map[l.book_id] = { readers: new Set(), viewUsers: new Set(), lastActivity: l.created_at };
      map[l.book_id].viewUsers.add(l.user_id);
      if (l.created_at > map[l.book_id].lastActivity) map[l.book_id].lastActivity = l.created_at;
    });

    return Object.entries(map)
      .sort((a, b) => b[1].readers.size - a[1].readers.size)
      .map(([bookId, d]) => ({
        bookId,
        title: bookMap[bookId]?.title || bookId.slice(0, 8),
        uniqueReaders: d.readers.size,
        totalViews: d.viewUsers.size,
        lastActivity: format(new Date(d.lastActivity), "dd MMM yyyy"),
      }));
  }, [bookReads, logs, bookMap]);

  // ── TOP 10 MOST READ ──
  const top10 = useMemo(() => {
    const map: Record<string, { readCount: number; uniqueReaders: Set<string>; views: number }> = {};

    bookReads.forEach(r => {
      if (!map[r.book_id]) map[r.book_id] = { readCount: 0, uniqueReaders: new Set(), views: 0 };
      map[r.book_id].readCount++;
      map[r.book_id].uniqueReaders.add(r.user_id);
    });

    logs.filter(l => l.event_type === "book_view" && l.book_id).forEach(l => {
      if (!l.book_id) return;
      if (!map[l.book_id]) map[l.book_id] = { readCount: 0, uniqueReaders: new Set(), views: 0 };
      map[l.book_id].views++;
    });

    return Object.entries(map)
      .sort((a, b) => b[1].readCount - a[1].readCount)
      .slice(0, 10)
      .map(([bookId, d], i) => ({
        rank: i + 1,
        bookId,
        title: bookMap[bookId]?.title || bookId.slice(0, 8),
        totalReads: d.readCount,
        uniqueReaders: d.uniqueReaders.size,
        views: d.views,
      }));
  }, [bookReads, logs, bookMap]);

  // ── ACTIVE READERS (time buckets) ──
  const activeReaders = useMemo(() => {
    const now = Date.now();
    const buckets = [
      { label: "Last 5 min", ms: 5 * 60 * 1000 },
      { label: "Last 30 min", ms: 30 * 60 * 1000 },
      { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
      { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
      { label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
    ];

    return buckets.map(b => {
      const cutoff = new Date(now - b.ms).toISOString();
      const recentLogs = logs.filter(l => l.created_at >= cutoff);
      const activeUsers = new Set(recentLogs.map(l => l.user_id));
      const activeReadersSet = new Set(recentLogs.filter(l => ["reading_progress", "book_view"].includes(l.event_type)).map(l => l.user_id));
      const activeListeners = new Set(recentLogs.filter(l => l.event_type === "listening_progress").map(l => l.user_id));

      return { label: b.label, activeUsers: activeUsers.size, activeReaders: activeReadersSet.size, activeListeners: activeListeners.size };
    });
  }, [logs]);

  // ── LIVE PRESENCE ──
  const liveMetrics = useMemo(() => {
    const now = Date.now();
    const fiveMin = new Date(now - 5 * 60 * 1000).toISOString();
    const online = presenceData.filter((p: any) => p.last_seen >= fiveMin);
    const reading = online.filter((p: any) => p.activity_type === "reading");
    const listening = online.filter((p: any) => p.activity_type === "listening");
    return { online: online.length, reading: reading.length, listening: listening.length };
  }, [presenceData]);

  // ── TRENDING BOOKS (recent activity) ──
  const trendingBooks = useMemo(() => {
    const days = parseInt(trendingPeriod) || 7;
    const cutoff = subDays(new Date(), days).toISOString();
    const recentLogs = logs.filter(l => l.created_at >= cutoff && l.book_id);

    const map: Record<string, { score: number; views: number; uniqueUsers: Set<string> }> = {};
    recentLogs.forEach(l => {
      if (!l.book_id) return;
      if (!map[l.book_id]) map[l.book_id] = { score: 0, views: 0, uniqueUsers: new Set() };
      map[l.book_id].uniqueUsers.add(l.user_id);
      if (l.event_type === "book_view") { map[l.book_id].score += 1; map[l.book_id].views++; }
      if (l.event_type === "reading_progress") map[l.book_id].score += 3;
      if (l.event_type === "listening_progress") map[l.book_id].score += 3;
      if (l.event_type === "purchase") map[l.book_id].score += 5;
      if (l.event_type === "unlock") map[l.book_id].score += 4;
    });

    // Also include book_reads in period
    bookReads.filter(r => r.created_at >= cutoff).forEach(r => {
      if (!map[r.book_id]) map[r.book_id] = { score: 0, views: 0, uniqueUsers: new Set() };
      map[r.book_id].score += 2;
      map[r.book_id].uniqueUsers.add(r.user_id);
    });

    return Object.entries(map)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 15)
      .map(([bookId, d], i) => ({
        rank: i + 1,
        bookId,
        title: bookMap[bookId]?.title || bookId.slice(0, 8),
        score: d.score,
        views: d.views,
        uniqueReaders: d.uniqueUsers.size,
      }));
  }, [logs, bookReads, bookMap, trendingPeriod]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const statCards = [
    { label: "Online Now", value: liveMetrics.online, icon: Activity, color: "text-green-400", filter: "online" as LiveUserFilter },
    { label: "Reading Now", value: liveMetrics.reading, icon: BookOpen, color: "text-blue-400", filter: "reading" as LiveUserFilter },
    { label: "Listening Now", value: liveMetrics.listening, icon: Headphones, color: "text-purple-400", filter: "listening" as LiveUserFilter },
    { label: "Total Activity Logs", value: logs.length, icon: BarChart3, color: "text-primary", filter: null as LiveUserFilter },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" /> Reading Analytics & Reports
        </h1>
        <p className="text-muted-foreground text-sm">Real-time reading activity, daily/monthly reports, and trending analysis</p>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <Card
            key={s.label}
            className={`border-border/30 transition-colors ${s.filter ? "cursor-pointer hover:border-primary/40 hover:bg-secondary/30" : ""}`}
            onClick={() => s.filter && setLiveFilter(s.filter)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-secondary/60">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <LiveUsersModal filter={liveFilter} onClose={() => setLiveFilter(null)} />

      {/* Active Readers Time Buckets */}
      <Card className="border-border/30">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Active Users by Time Window</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {activeReaders.map(b => (
              <div key={b.label} className="p-3 rounded-lg bg-secondary/40 text-center space-y-1">
                <p className="text-[11px] text-muted-foreground">{b.label}</p>
                <p className="text-lg font-bold">{b.activeUsers}</p>
                <div className="flex justify-center gap-2 text-[10px]">
                  <span className="text-blue-400">📖 {b.activeReaders}</span>
                  <span className="text-purple-400">🎧 {b.activeListeners}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="daily">
        <TabsList className="flex-wrap">
          <TabsTrigger value="daily">Daily Report</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
          <TabsTrigger value="bookviews">Book Views</TabsTrigger>
          <TabsTrigger value="unique">Unique Readers</TabsTrigger>
          <TabsTrigger value="top10">Top 10 Most Read</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
        </TabsList>

        {/* ── DAILY REPORT ── */}
        <TabsContent value="daily" className="space-y-4 mt-4">
          <Card className="border-border/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Daily Reading Report (Last 30 Days)</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(dailyReport, "daily-reading-report")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              {dailyReport.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={[...dailyReport].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="views" name="Views" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="reads" name="Reads" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="uniqueReaders" name="Unique Readers" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No daily data yet</p>}

              <div className="overflow-auto max-h-[400px] mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Reads</TableHead>
                      <TableHead className="text-right">Unique Readers</TableHead>
                      <TableHead className="text-right">eBook</TableHead>
                      <TableHead className="text-right">Audiobook</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyReport.map(d => (
                      <TableRow key={d.date}>
                        <TableCell className="text-sm">{d.date}</TableCell>
                        <TableCell className="text-right text-sm">{d.views}</TableCell>
                        <TableCell className="text-right text-sm">{d.reads}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-primary">{d.uniqueReaders}</TableCell>
                        <TableCell className="text-right text-sm text-blue-400">{d.ebook}</TableCell>
                        <TableCell className="text-right text-sm text-purple-400">{d.audiobook}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MONTHLY REPORT ── */}
        <TabsContent value="monthly" className="space-y-4 mt-4">
          <Card className="border-border/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Monthly Reading Report</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(monthlyReport, "monthly-reading-report")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              {monthlyReport.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthlyReport}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="views" name="Views" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="reads" name="Reads" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="uniqueReaders" name="Unique Readers" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No monthly data yet</p>}

              <div className="overflow-auto max-h-[400px] mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Reads</TableHead>
                      <TableHead className="text-right">Unique Readers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyReport.map(d => (
                      <TableRow key={d.month}>
                        <TableCell className="text-sm font-medium">{d.month}</TableCell>
                        <TableCell className="text-right text-sm">{d.views}</TableCell>
                        <TableCell className="text-right text-sm">{d.reads}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-primary">{d.uniqueReaders}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BOOK-WISE VIEWS ── */}
        <TabsContent value="bookviews" className="space-y-4 mt-4">
          <Card className="border-border/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4 text-blue-400" /> Book-Wise Total Views</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(bookViews, "book-views")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              {bookViews.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={bookViews.slice(0, 15)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="title" type="category" width={160} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="views" name="Views" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-auto max-h-[400px] mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Book</TableHead>
                          <TableHead className="text-right">Views (Activity)</TableHead>
                          <TableHead className="text-right">Cached Reads</TableHead>
                          <TableHead className="text-right">Last Activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookViews.map((b, i) => (
                          <TableRow key={b.bookId}>
                            <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                            <TableCell className="font-medium max-w-[200px] truncate">{b.title}</TableCell>
                            <TableCell className="text-right"><Badge className="bg-blue-500/20 text-blue-400">{b.views}</Badge></TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{b.cachedReads}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{format(new Date(b.lastActivity), "dd MMM yyyy")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No view data yet</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── UNIQUE READERS ── */}
        <TabsContent value="unique" className="space-y-4 mt-4">
          <Card className="border-border/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-emerald-400" /> Unique Users Per Book</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(uniqueUsersPerBook, "unique-readers")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Book</TableHead>
                      <TableHead className="text-right">Unique Readers</TableHead>
                      <TableHead className="text-right">View Users</TableHead>
                      <TableHead className="text-right">Last Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uniqueUsersPerBook.length > 0 ? uniqueUsersPerBook.map((b, i) => (
                      <TableRow key={b.bookId}>
                        <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{b.title}</TableCell>
                        <TableCell className="text-right"><Badge className="bg-emerald-500/20 text-emerald-400">{b.uniqueReaders}</Badge></TableCell>
                        <TableCell className="text-right text-sm">{b.totalViews}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{b.lastActivity}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No reader data yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TOP 10 ── */}
        <TabsContent value="top10" className="space-y-4 mt-4">
          <Card className="border-border/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Top 10 Most Read Books</CardTitle>
              <Button variant="outline" size="sm" onClick={() => exportCSV(top10, "top-10-books")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              {top10.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={top10}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="title" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="totalReads" name="Reads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="views" name="Views" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-auto max-h-[400px] mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Book</TableHead>
                          <TableHead className="text-right">Reads</TableHead>
                          <TableHead className="text-right">Unique Readers</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {top10.map(b => (
                          <TableRow key={b.bookId}>
                            <TableCell className="font-bold text-primary text-lg">{b.rank}</TableCell>
                            <TableCell className="font-medium max-w-[200px] truncate">{b.title}</TableCell>
                            <TableCell className="text-right"><Badge className="bg-primary/20 text-primary">{b.totalReads}</Badge></TableCell>
                            <TableCell className="text-right text-sm">{b.uniqueReaders}</TableCell>
                            <TableCell className="text-right"><Badge className="bg-blue-500/20 text-blue-400">{b.views}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No reading data yet</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TRENDING ── */}
        <TabsContent value="trending" className="space-y-4 mt-4">
          <Card className="border-border/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Flame className="h-4 w-4 text-orange-500" /> Trending Books</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Based on recent {trendingPeriod}-day activity (configurable via Recommendations settings)</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={trendingPeriod} onValueChange={setTrendingPeriod}>
                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="15">15 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => exportCSV(trendingBooks, "trending-books")}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {trendingBooks.length > 0 ? (
                <div className="overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Book</TableHead>
                        <TableHead className="text-right">Activity Score</TableHead>
                        <TableHead className="text-right">Views</TableHead>
                        <TableHead className="text-right">Unique Readers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trendingBooks.map(b => (
                        <TableRow key={b.bookId}>
                          <TableCell className="font-bold text-orange-500 text-lg">{b.rank}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">{b.title}</TableCell>
                          <TableCell className="text-right"><Badge className="bg-orange-500/20 text-orange-400">{b.score}</Badge></TableCell>
                          <TableCell className="text-right text-sm">{b.views}</TableCell>
                          <TableCell className="text-right text-sm">{b.uniqueReaders}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No trending data in the selected period</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
