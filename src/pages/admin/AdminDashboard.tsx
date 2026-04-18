import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Users, Mic2, ShoppingCart, DollarSign, Headphones, Package,
  TrendingUp, UserCheck, Star, Eye, CheckCircle, XCircle, Wallet,
  ArrowUpRight, ArrowDownRight, Activity, BarChart3, Coins, BookCopy,
  AlertTriangle, Clock, Percent, Layers,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { approveCreatorApplication, rejectCreatorApplication } from "@/lib/approveCreator";
import { useCountUp } from "@/hooks/useCountUp";
import { isVerifiedRevenueOrder, calculateTotalProfit, calculateOrderProfit, getItemBuyingCost, type RevenueOrder, type OrderItemWithCost } from "@/hooks/useUnifiedRevenue";

const COLORS = ["hsl(var(--primary))", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

const chartTooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

interface DashboardStats {
  totalBooks: number;
  totalEbooks: number;
  totalAudiobooks: number;
  totalHardcopies: number;
  totalAuthors: number;
  totalNarrators: number;
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  todayIncome: number;
  todayExpense: number;
  todayProfit: number;
  recentLedger: { description: string; amount: number; type: string; date: string }[];
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  ordersByStatus: { name: string; value: number }[];
  totalStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockBooks: { title: string; stock: number }[];
  revenueByMonth: { month: string; revenue: number; cost: number; profit: number }[];
  formatDistribution: { name: string; value: number }[];
  topBooks: { title: string; reads: number }[];
  topSellingBooks: { title: string; sales: number; revenue: number }[];
  topRatedBooks: { title: string; rating: number; reviews: number }[];
  writerEarnings: number;
  narratorEarnings: number;
  publisherEarnings: number;
  platformEarnings: number;
  totalViews: number;
  totalReads: number;
  totalPurchases: number;
  pendingApplications: any[];
  pendingReviews: { id: string; book: string; rating: number; date: string }[];
  recentOrders: { id: string; total: number; status: string; created: string }[];
  paidUsers: number;
  onlineNow: number;
  readingNow: number;
  listeningNow: number;
  // New financial fields
  formatProfit: { format: string; revenue: number; profit: number }[];
  topEarningBooks: { title: string; revenue: number; profit: number }[];
  codPending: number;
  codCollected: number;
  codSettled: number;
  realNetProfit: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [chartsVisible, setChartsVisible] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleApproval = async (app: any, action: "approved" | "rejected") => {
    try {
      if (action === "approved") {
        await approveCreatorApplication({ applicationId: app.fullId, userId: app.userId, role: app.role, reviewerId: user?.id });
      } else {
        await rejectCreatorApplication({ applicationId: app.fullId, reviewerId: user?.id });
      }
      toast({ title: action === "approved" ? "Approved!" : "Rejected." });
      setStats(null);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const load = async () => {
    const today = new Date().toISOString().split("T")[0];

    const [
      books, formats, authors, narrators, orders, profiles, topBooks,
      recentOrders, applications, reviews, orderItems, bookFormatCosts, ledgerData,
      coinData, earnings, topRated, bookReads, hardcopyFormats, todayLedger,
      recentLedgerRows, paidOrderUsers, presenceRes, codOrdersRes,
    ] = await Promise.all([
      supabase.from("books").select("id", { count: "exact", head: true }),
      supabase.from("book_formats").select("format, price"),
      supabase.from("authors").select("id", { count: "exact", head: true }),
      supabase.from("narrators").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("total_amount, status, created_at, id, packaging_cost, fulfillment_cost, shipping_cost, payment_method, cod_payment_status, purchase_cost_per_unit, is_purchased"),
      supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      supabase.from("books").select("title, total_reads").order("total_reads", { ascending: false }).limit(5),
      supabase.from("orders").select("id, total_amount, status, created_at").order("created_at", { ascending: false }).limit(6),
      supabase.from("role_applications").select("id, requested_role, user_id, created_at, status, full_name, display_name, email, phone, avatar_url, bio, experience, facebook_url, instagram_url, youtube_url, website_url, portfolio_url, message").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
      supabase.from("reviews").select("id, rating, created_at, book_id, books(title)").order("created_at", { ascending: false }).limit(5),
      supabase.from("order_items").select("format, unit_price, quantity, book_id, order_id, books(title)"),
      supabase.from("book_formats").select("book_id, format, unit_cost, original_price, publisher_commission_percent"),
      supabase.from("accounting_ledger" as any).select("type, amount, entry_date"),
      supabase.from("coin_transactions").select("type, amount"),
      supabase.from("contributor_earnings").select("role, earned_amount, sale_amount, format, book_id, status, books(title)"),
      supabase.from("books").select("title, rating, reviews_count").order("rating", { ascending: false }).limit(5),
      supabase.from("book_reads").select("id", { count: "exact", head: true }),
      supabase.from("book_formats").select("book_id, stock_count, format, books(title)").eq("format", "hardcopy"),
      supabase.from("accounting_ledger" as any).select("type, amount").gte("entry_date", today),
      supabase.from("accounting_ledger" as any).select("description, amount, type, entry_date").order("created_at", { ascending: false }).limit(5),
      supabase.from("orders").select("user_id").not("status", "eq", "cancelled"),
      supabase.from("user_presence" as any).select("activity_type, last_seen"),
      supabase.from("orders").select("total_amount, payment_method, cod_payment_status, status").eq("payment_method", "cod"),
    ]);

    const fmts = formats.data || [];
    const allOrders = orders.data || [];
    const ledgerEntries = (ledgerData.data as any[]) || [];
    const coins = coinData.data || [];
    const earningsData = earnings.data || [];

    // Build format cost lookup: book_id+format → cost data
    const formatCostMap: Record<string, { unit_cost: number; original_price: number; publisher_commission_percent: number }> = {};
    (bookFormatCosts.data || []).forEach((f: any) => {
      formatCostMap[`${f.book_id}_${f.format}`] = {
        unit_cost: f.unit_cost || 0,
        original_price: f.original_price || 0,
        publisher_commission_percent: f.publisher_commission_percent || 0,
      };
    });

    const ebookCount = fmts.filter(f => f.format === "ebook").length;
    const audioCount = fmts.filter(f => f.format === "audiobook").length;
    const hardCount = fmts.filter(f => f.format === "hardcopy").length;

    const validOrders = allOrders.filter(o => isVerifiedRevenueOrder(o as RevenueOrder));
    const paidOrderIds = new Set(validOrders.map(o => o.id));

    // Enrich order items with cost data
    const enrichedItems: OrderItemWithCost[] = (orderItems.data || [])
      .filter((i: any) => paidOrderIds.has(i.order_id))
      .map((i: any) => {
        const fc = formatCostMap[`${i.book_id}_${i.format}`] || { unit_cost: 0, original_price: 0, publisher_commission_percent: 0 };
        return {
          order_id: i.order_id,
          book_id: i.book_id,
          format: i.format,
          unit_price: i.unit_price || 0,
          quantity: i.quantity || 1,
          unit_cost: fc.unit_cost,
          original_price: fc.original_price,
          publisher_commission_percent: fc.publisher_commission_percent,
        };
      });

    // Real profit using unit_cost
    const realNetProfit = calculateTotalProfit(validOrders as RevenueOrder[], enrichedItems);

    // Build items-by-order map for profit calc
    const itemsByOrder: Record<string, OrderItemWithCost[]> = {};
    enrichedItems.forEach(i => {
      if (!itemsByOrder[i.order_id]) itemsByOrder[i.order_id] = [];
      itemsByOrder[i.order_id].push(i);
    });

    const monthMap: Record<string, { revenue: number; cost: number; profit: number }> = {};
    validOrders.forEach(o => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = { revenue: 0, cost: 0, profit: 0 };
      monthMap[key].revenue += o.total_amount || 0;
      monthMap[key].profit += calculateOrderProfit(o as RevenueOrder, itemsByOrder[o.id] || []);
    });
    ledgerEntries.forEach((e: any) => {
      const key = e.entry_date?.slice(0, 7);
      if (!key) return;
      if (!monthMap[key]) monthMap[key] = { revenue: 0, cost: 0, profit: 0 };
      if (e.type === "expense") monthMap[key].cost += Number(e.amount);
    });
    const revenueByMonth = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, d]) => ({ month, revenue: d.revenue, cost: d.cost, profit: d.profit }));

    const totalIncome = ledgerEntries.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const totalExpense = ledgerEntries.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const todayEntries = (todayLedger.data as any[]) || [];
    const todayIncome = todayEntries.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const todayExpense = todayEntries.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);

    const totalCoinsEarned = coins.filter(c => c.type === "earn" || c.type === "bonus").reduce((s, c) => s + Math.abs(c.amount), 0);
    const totalCoinsSpent = coins.filter(c => c.type === "spend").reduce((s, c) => s + Math.abs(c.amount), 0);

    const statusMap: Record<string, number> = {};
    allOrders.forEach(o => { statusMap[o.status || "pending"] = (statusMap[o.status || "pending"] || 0) + 1; });
    const ordersByStatus = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

    const hcFormats = (hardcopyFormats.data as any[]) || [];
    const totalStock = hcFormats.reduce((s: number, f: any) => s + (f.stock_count || 0), 0);
    const outOfStockCount = hcFormats.filter((f: any) => (f.stock_count || 0) <= 0).length;
    const lowStockCount = hcFormats.filter((f: any) => { const s = f.stock_count || 0; return s > 0 && s <= 5; }).length;
    const lowStockBooks = hcFormats
      .filter((f: any) => (f.stock_count || 0) <= 5)
      .map((f: any) => ({ title: f.books?.title || "Unknown", stock: f.stock_count || 0 }))
      .sort((a: any, b: any) => a.stock - b.stock)
      .slice(0, 8);

    const bookSales: Record<string, { title: string; sales: number; revenue: number }> = {};
    (orderItems.data || []).filter((item: any) => paidOrderIds.has(item.order_id)).forEach((item: any) => {
      const key = item.book_id;
      if (!key) return;
      if (!bookSales[key]) bookSales[key] = { title: item.books?.title || "Unknown", sales: 0, revenue: 0 };
      bookSales[key].sales += item.quantity || 1;
      bookSales[key].revenue += (item.unit_price || 0) * (item.quantity || 1);
    });
    const topSellingBooks = Object.values(bookSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const activeEarnings = earningsData.filter((e: any) => e.status !== "reversed");
    const writerEarnings = activeEarnings.filter((e: any) => e.role === "writer").reduce((s: number, e: any) => s + Number(e.earned_amount), 0);
    const narratorEarnings = activeEarnings.filter((e: any) => e.role === "narrator").reduce((s: number, e: any) => s + Number(e.earned_amount), 0);
    const publisherEarnings = activeEarnings.filter((e: any) => e.role === "publisher").reduce((s: number, e: any) => s + Number(e.earned_amount), 0);
    const totalSaleAmount = activeEarnings.reduce((s: number, e: any) => s + Number(e.sale_amount), 0);
    const totalEarnedByCreators = writerEarnings + narratorEarnings + publisherEarnings;
    const platformEarnings = totalSaleAmount - totalEarnedByCreators;

    const paidUserIds = new Set((paidOrderUsers.data || []).map((o: any) => o.user_id));

    const totalViews = 0; // Real view tracking not yet implemented
    const totalReads = bookReads.count || 0;
    const totalPurchases = validOrders.length;

    // Presence metrics
    const presenceRows = (presenceRes.data as any[]) || [];
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const onlineNow = presenceRows.filter((p: any) => p.last_seen >= fiveMinAgo).length;
    const readingNow = presenceRows.filter((p: any) => p.last_seen >= fiveMinAgo && p.activity_type === "reading").length;
    const listeningNow = presenceRows.filter((p: any) => p.last_seen >= fiveMinAgo && p.activity_type === "listening").length;

    // Format-wise profit using unit_cost
    const fmtProfitMap: Record<string, { format: string; revenue: number; buyingCost: number; profit: number }> = {};
    enrichedItems.forEach((item) => {
      const fmt = item.format;
      if (!fmtProfitMap[fmt]) fmtProfitMap[fmt] = { format: fmt === "ebook" ? "eBook" : fmt === "audiobook" ? "Audiobook" : "Hard Copy", revenue: 0, buyingCost: 0, profit: 0 };
      fmtProfitMap[fmt].revenue += item.unit_price * item.quantity;
      fmtProfitMap[fmt].buyingCost += getItemBuyingCost(item) * item.quantity;
    });
    // For digital formats, subtract creator earnings; for hardcopy, use unit_cost
    activeEarnings.filter((e: any) => e.role !== "platform" && e.format !== "hardcopy").forEach((e: any) => {
      if (fmtProfitMap[e.format]) fmtProfitMap[e.format].buyingCost += Number(e.earned_amount);
    });
    Object.values(fmtProfitMap).forEach(f => { f.profit = f.revenue - f.buyingCost; });
    const formatProfit = Object.values(fmtProfitMap).filter(f => f.revenue > 0);

    // Top earning books with unit_cost-based profit
    const bookEarnMap: Record<string, { title: string; revenue: number; buyingCost: number }> = {};
    enrichedItems.forEach((item) => {
      if (!item.book_id) return;
      const title = (orderItems.data || []).find((i: any) => i.book_id === item.book_id)?.books?.title || "Unknown";
      if (!bookEarnMap[item.book_id]) bookEarnMap[item.book_id] = { title, revenue: 0, buyingCost: 0 };
      bookEarnMap[item.book_id].revenue += item.unit_price * item.quantity;
      bookEarnMap[item.book_id].buyingCost += getItemBuyingCost(item) * item.quantity;
    });
    const topEarningBooks = Object.values(bookEarnMap)
      .map(b => ({ title: b.title, revenue: b.revenue, profit: b.revenue - b.buyingCost }))
      .sort((a, b) => b.profit - a.profit).slice(0, 5);

    // COD tracking
    const codRows = (codOrdersRes.data as any[]) || [];
    const codPending = codRows.filter(o => ["unpaid", "cod_pending_collection"].includes(o.cod_payment_status)).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
    const codCollected = codRows.filter(o => o.cod_payment_status === "collected_by_courier").reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
    const codSettled = codRows.filter(o => ["settled_to_merchant", "paid"].includes(o.cod_payment_status)).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);

    const appUserIds = (applications.data || []).map(a => a.user_id);
    let appProfiles: Record<string, string> = {};
    if (appUserIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", appUserIds);
      (profs || []).forEach(p => { appProfiles[p.user_id] = p.display_name || p.user_id.slice(0, 8); });
    }

    setStats({
      totalBooks: books.count || 0,
      totalEbooks: ebookCount,
      totalAudiobooks: audioCount,
      totalHardcopies: hardCount,
      totalAuthors: authors.count || 0,
      totalNarrators: narrators.count || 0,
      totalUsers: profiles.count || 0,
      totalOrders: allOrders.length,
      totalRevenue: validOrders.reduce((s, o) => s + ((o.total_amount || 0) - (o.shipping_cost || 0)), 0),
      totalIncome, totalExpense, netProfit: totalIncome - totalExpense,
      todayIncome, todayExpense, todayProfit: todayIncome - todayExpense,
      recentLedger: ((recentLedgerRows.data as any[]) || []).map((r: any) => ({
        description: r.description || "—", amount: Number(r.amount), type: r.type,
        date: new Date(r.entry_date).toLocaleDateString(),
      })),
      totalCoinsEarned, totalCoinsSpent,
      ordersByStatus,
      totalStock, lowStockCount, outOfStockCount, lowStockBooks,
      revenueByMonth,
      formatDistribution: [
        { name: "eBook", value: ebookCount },
        { name: "Audiobook", value: audioCount },
        { name: "Hard Copy", value: hardCount },
      ].filter(f => f.value > 0),
      topBooks: (topBooks.data || []).map(b => ({ title: b.title, reads: b.total_reads || 0 })),
      topSellingBooks,
      topRatedBooks: (topRated.data || []).filter((b: any) => b.rating > 0).map((b: any) => ({
        title: b.title, rating: Number(b.rating), reviews: b.reviews_count || 0,
      })),
      writerEarnings, narratorEarnings, publisherEarnings, platformEarnings: Math.max(0, platformEarnings),
      totalViews, totalReads, totalPurchases,
      paidUsers: paidUserIds.size,
      pendingApplications: (applications.data || []).map(a => ({
        id: a.id.slice(0, 8), fullId: a.id, userId: a.user_id, role: a.requested_role,
        user: appProfiles[a.user_id] || a.display_name || a.full_name || a.user_id.slice(0, 8),
        date: new Date(a.created_at).toLocaleDateString(),
        avatar_url: a.avatar_url, full_name: a.full_name, display_name: a.display_name,
        email: a.email, phone: a.phone, bio: a.bio, experience: a.experience,
        facebook_url: a.facebook_url, instagram_url: a.instagram_url, youtube_url: a.youtube_url,
        website_url: a.website_url, portfolio_url: a.portfolio_url, message: a.message,
      })),
      pendingReviews: (reviews.data || []).map((r: any) => ({
        id: r.id.slice(0, 8), book: r.books?.title || "Unknown",
        rating: r.rating, date: new Date(r.created_at).toLocaleDateString(),
      })),
      recentOrders: (recentOrders.data || []).map(o => ({
        id: o.id.slice(0, 8), total: o.total_amount || 0,
        status: o.status || "pending", created: new Date(o.created_at).toLocaleDateString(),
      })),
      onlineNow,
      readingNow,
      listeningNow,
      formatProfit,
      topEarningBooks,
      codPending,
      codCollected,
      codSettled,
      realNetProfit,
    });
    // Trigger chart animations after data loads
    setTimeout(() => setChartsVisible(true), 150);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    supabase.from("system_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false)
      .then(({ count }) => setActiveAlerts(count ?? 0));
  }, []);

  if (!stats) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}
      </div>
    </div>
  );

  const conversionRate = stats.totalUsers > 0 ? ((stats.paidUsers / stats.totalUsers) * 100).toFixed(1) : "0";

  const statusColor: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400 animate-pulse",
    processing: "bg-blue-500/20 text-blue-400",
    shipped: "bg-purple-500/20 text-purple-400",
    delivered: "bg-emerald-500/20 text-emerald-400",
    completed: "bg-emerald-500/20 text-emerald-400",
    cancelled: "bg-destructive/20 text-destructive",
    confirmed: "bg-emerald-500/20 text-emerald-400",
  };

  const earningsBreakdown = [
    { name: "Writer", value: stats.writerEarnings },
    { name: "Narrator", value: stats.narratorEarnings },
    { name: "Publisher", value: stats.publisherEarnings },
    { name: "Platform", value: stats.platformEarnings },
  ].filter(e => e.value > 0);

  const funnelData = [
    { name: "Reads", value: stats.totalReads },
    { name: "Purchases", value: stats.totalPurchases },
  ].filter(f => f.value > 0);


  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* === EXECUTIVE COMMAND CENTER === */}
        <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-wide uppercase text-primary flex items-center gap-2">
              <Activity className="h-4 w-4" /> Executive Command Center
            </h2>
            <Badge variant="outline" className="text-[10px]">Live</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-card/80 rounded-lg p-3 border border-border/30 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/admin/user-analytics")}>
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-[10px] text-muted-foreground">Active Now</span>
              </div>
              <p className="text-xl font-bold">{stats.onlineNow}</p>
              <p className="text-[9px] text-muted-foreground">{stats.readingNow} reading · {stats.listeningNow} listening</p>
            </div>
            <div className="bg-card/80 rounded-lg p-3 border border-border/30 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/admin/financial-reports")}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] text-muted-foreground">Today Revenue</span>
              </div>
              <p className="text-xl font-bold">৳{stats.todayIncome.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">Expense: ৳{stats.todayExpense.toLocaleString()}</p>
            </div>
            <div className="bg-card/80 rounded-lg p-3 border border-border/30 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/admin/analytics")}>
              <div className="flex items-center gap-2 mb-1">
                <Percent className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[10px] text-muted-foreground">Conversion Rate</span>
              </div>
              <p className="text-xl font-bold">{conversionRate}%</p>
              <p className="text-[9px] text-muted-foreground">{stats.paidUsers} / {stats.totalUsers} users</p>
            </div>
            <div className="bg-card/80 rounded-lg p-3 border border-border/30 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/admin/performance")}>
              <div className="flex items-center gap-2 mb-1">
                <Headphones className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-[10px] text-muted-foreground">Playback Health</span>
              </div>
              <p className="text-xl font-bold text-emerald-400">✓ OK</p>
              <p className="text-[9px] text-muted-foreground">No failures detected</p>
            </div>
            <div className={`bg-card/80 rounded-lg p-3 border cursor-pointer hover:border-primary/30 transition-colors ${activeAlerts > 0 ? "border-destructive/40" : "border-border/30"}`} onClick={() => navigate("/admin/alerts")}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={`h-3.5 w-3.5 ${activeAlerts > 0 ? "text-destructive" : "text-emerald-400"}`} />
                <span className="text-[10px] text-muted-foreground">Active Alerts</span>
              </div>
              <p className={`text-xl font-bold ${activeAlerts > 0 ? "text-destructive" : "text-emerald-400"}`}>{activeAlerts}</p>
              <p className="text-[9px] text-muted-foreground">{activeAlerts === 0 ? "All systems healthy" : "Needs attention"}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold">Business Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Real-time business performance overview</p>
          </div>
          <Badge variant="outline" className="text-xs">{new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</Badge>
        </div>

        {/* === SECTION 1: Financial KPIs === */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StaggeredItem index={0}>
            <KPICard icon={DollarSign} label="Verified Order Revenue" value={stats.totalRevenue} prefix="৳" tooltip="Revenue from verified paid orders only. Excludes manual ledger entries and adjustments." color="text-emerald-400" bgColor="bg-emerald-500/10" onClick={() => navigate("/admin/financial-reports")} />
          </StaggeredItem>
          <StaggeredItem index={1}>
            <KPICard icon={TrendingUp} label="Real Net Profit" value={stats.realNetProfit} prefix="৳" tooltip="Revenue - costs - creator payouts - expenses" color={stats.realNetProfit >= 0 ? "text-primary" : "text-red-400"} bgColor={stats.realNetProfit >= 0 ? "bg-primary/10" : "bg-red-500/10"} onClick={() => navigate("/admin/financial-reports")} />
          </StaggeredItem>
          <StaggeredItem index={2}>
            <KPICard icon={ArrowDownRight} label="Total Expense" value={stats.totalExpense} prefix="৳" tooltip="Total expenses from ledger" color="text-red-400" bgColor="bg-red-500/10" onClick={() => navigate("/admin/accounting")} />
          </StaggeredItem>
          <StaggeredItem index={3}>
            <KPICard icon={Wallet} label="COD Pending" value={stats.codPending} prefix="৳" tooltip="COD amount not yet collected" color="text-amber-400" bgColor="bg-amber-500/10" onClick={() => navigate("/admin/financial-reports")} />
          </StaggeredItem>
          <StaggeredItem index={4}>
            <KPICard icon={Wallet} label="COD Settled" value={stats.codSettled} prefix="৳" tooltip="COD settled to account" color="text-emerald-400" bgColor="bg-emerald-500/10" onClick={() => navigate("/admin/financial-reports")} />
          </StaggeredItem>
        </div>

        {/* === SECTION 2: User & Conversion KPIs === */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StaggeredItem index={4}>
            <KPICard icon={Users} label="Active Users" value={stats.totalUsers} tooltip="Total registered users" color="text-purple-400" bgColor="bg-purple-500/10" onClick={() => navigate("/admin/users")} />
          </StaggeredItem>
          <StaggeredItem index={5}>
            <KPICard icon={UserCheck} label="Paid Users" value={stats.paidUsers} tooltip="Users with at least one order" color="text-emerald-400" bgColor="bg-emerald-500/10" onClick={() => navigate("/admin/users")} />
          </StaggeredItem>
          <StaggeredItem index={6}>
            <KPICard icon={Percent} label="Conversion Rate" value={conversionRate} suffix="%" tooltip="Paid users / Total users" color="text-blue-400" bgColor="bg-blue-500/10" onClick={() => navigate("/admin/analytics")} />
          </StaggeredItem>
          <StaggeredItem index={7}>
            <KPICard icon={Coins} label="Coins Earned" value={stats.totalCoinsEarned} tooltip="Total coins earned by users" color="text-amber-400" bgColor="bg-amber-500/10" onClick={() => navigate("/admin/coin-settings")} />
          </StaggeredItem>
          <StaggeredItem index={8}>
            <KPICard icon={Coins} label="Coins Spent" value={stats.totalCoinsSpent} tooltip="Total coins spent by users" color="text-orange-400" bgColor="bg-orange-500/10" onClick={() => navigate("/admin/coin-settings")} />
          </StaggeredItem>
          <StaggeredItem index={9}>
            <KPICard icon={ShoppingCart} label="Total Orders" value={stats.totalOrders} tooltip="All orders placed" color="text-emerald-400" bgColor="bg-emerald-500/10" onClick={() => navigate("/admin/orders")} />
          </StaggeredItem>
        </div>

        {/* === SECTION 2.5: Live Activity === */}
        <div className="grid grid-cols-3 gap-3">
          <StaggeredItem index={10}>
            <KPICard icon={Activity} label="Online Now" value={stats.onlineNow} tooltip="Users active in last 5 minutes" color="text-green-400" bgColor="bg-green-500/10" onClick={() => navigate("/admin/reading-analytics")} />
          </StaggeredItem>
          <StaggeredItem index={11}>
            <KPICard icon={BookOpen} label="Reading Now" value={stats.readingNow} tooltip="Users currently reading ebooks" color="text-blue-400" bgColor="bg-blue-500/10" onClick={() => navigate("/admin/reading-analytics")} />
          </StaggeredItem>
          <StaggeredItem index={12}>
            <KPICard icon={Headphones} label="Listening Now" value={stats.listeningNow} tooltip="Users currently listening to audiobooks" color="text-purple-400" bgColor="bg-purple-500/10" onClick={() => navigate("/admin/reading-analytics")} />
          </StaggeredItem>
        </div>

        {/* === SECTION 3: Revenue vs Cost vs Profit Chart + Format Distribution === */}
        <div className={`grid md:grid-cols-3 gap-4 transition-all duration-700 ${chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Card className="md:col-span-2 border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tooltip><TooltipTrigger><BarChart3 className="h-4 w-4 text-primary" /></TooltipTrigger><TooltipContent>Monthly financial breakdown</TooltipContent></Tooltip>
                Revenue vs Cost vs Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.revenueByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <RechartsTooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [`৳${v.toLocaleString()}`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} animationDuration={1200} animationEasing="ease-out" />
                    <Bar dataKey="cost" name="Cost" fill="#ef4444" radius={[3, 3, 0, 0]} animationDuration={1200} animationEasing="ease-out" animationBegin={200} />
                    <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[3, 3, 0, 0]} animationDuration={1200} animationEasing="ease-out" animationBegin={400} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={BarChart3} message="No financial data yet" />}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tooltip><TooltipTrigger><Layers className="h-4 w-4 text-blue-400" /></TooltipTrigger><TooltipContent>Book format breakdown</TooltipContent></Tooltip>
                Format Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.formatDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={stats.formatDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`} animationDuration={1200} animationEasing="ease-out">
                      {stats.formatDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <RechartsTooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={Layers} message="No formats yet" />}
            </CardContent>
          </Card>
        </div>

        {/* === SECTION 4: Hardcopy Inventory + Order Status + Funnel === */}
        <div className={`grid md:grid-cols-3 gap-4 transition-all duration-700 delay-100 ${chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tooltip><TooltipTrigger><Package className="h-4 w-4 text-emerald-400" /></TooltipTrigger><TooltipContent>Hardcopy stock levels</TooltipContent></Tooltip>
                Hardcopy Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg bg-secondary/50 text-center">
                  <span className="text-lg font-bold">{stats.totalStock}</span>
                  <p className="text-[10px] text-muted-foreground">Total Stock</p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-500/10 text-center">
                  <span className="text-lg font-bold text-amber-400">{stats.lowStockCount}</span>
                  <p className="text-[10px] text-amber-400/70">Low Stock</p>
                </div>
                <div className="p-2.5 rounded-lg bg-red-500/10 text-center">
                  <span className="text-lg font-bold text-red-400">{stats.outOfStockCount}</span>
                  <p className="text-[10px] text-red-400/70">Out of Stock</p>
                </div>
              </div>
              {stats.lowStockBooks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
                    <span className="text-xs font-medium">Needs Attention</span>
                  </div>
                  {stats.lowStockBooks.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-sm hover:bg-secondary/30 rounded px-1 py-0.5 transition-colors">
                      <span className="truncate max-w-[160px]">{b.title}</span>
                      <Badge variant="outline" className={`text-[10px] ${b.stock <= 0 ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}`}>
                        {b.stock <= 0 ? "Out" : `${b.stock} left`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              {stats.lowStockBooks.length === 0 && <p className="text-xs text-muted-foreground">All stock levels healthy ✓</p>}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tooltip><TooltipTrigger><ShoppingCart className="h-4 w-4 text-blue-400" /></TooltipTrigger><TooltipContent>Orders by status</TooltipContent></Tooltip>
                Order Status Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.ordersByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={stats.ordersByStatus} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`} animationDuration={1200} animationEasing="ease-out">
                      {stats.ordersByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={ShoppingCart} message="No orders yet" />}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tooltip><TooltipTrigger><Activity className="h-4 w-4 text-purple-400" /></TooltipTrigger><TooltipContent>Views → Reads → Purchases</TooltipContent></Tooltip>
                Conversion Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 pt-2">
                {funnelData.map((item, i) => {
                  const maxVal = Math.max(...funnelData.map(f => f.value), 1);
                  const pct = (item.value / maxVal) * 100;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-medium">{item.value.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: chartsVisible ? `${pct}%` : "0%", backgroundColor: COLORS[i] }}
                        />
                      </div>
                    </div>
                  );
                })}
                {stats.totalViews > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    View→Read: {((stats.totalReads / stats.totalViews) * 100).toFixed(1)}% · Read→Buy: {stats.totalReads > 0 ? ((stats.totalPurchases / stats.totalReads) * 100).toFixed(1) : 0}%
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* === SECTION 5: Financial Today + Creator Earnings === */}
        <div className={`grid md:grid-cols-2 gap-4 transition-all duration-700 delay-200 ${chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tooltip><TooltipTrigger><Clock className="h-4 w-4 text-amber-400" /></TooltipTrigger><TooltipContent>Today's ledger income, expense & balance from accounting_ledger</TooltipContent></Tooltip>
                Today's Financial Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-emerald-500/5 text-center">
                  <p className="text-lg font-bold text-emerald-400">৳{stats.todayIncome.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Total Ledger Income</p>
                </div>
                <div className="p-3 rounded-lg bg-red-500/5 text-center">
                  <p className="text-lg font-bold text-red-400">৳{stats.todayExpense.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Total Ledger Expense</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 text-center">
                  <p className={`text-lg font-bold ${stats.todayProfit >= 0 ? "text-primary" : "text-red-400"}`}>৳{stats.todayProfit.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Net Ledger Balance</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Recent Transactions</p>
              <div className="space-y-2">
                {stats.recentLedger.length > 0 ? stats.recentLedger.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm hover:bg-secondary/30 rounded px-1.5 py-1 transition-colors">
                    <span className="truncate max-w-[180px]">{t.description}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${t.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                        {t.type === "income" ? "+" : "-"}৳{t.amount}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{t.date}</span>
                    </div>
                  </div>
                )) : <EmptyState icon={DollarSign} message="No transactions recorded" />}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Tooltip><TooltipTrigger><Wallet className="h-4 w-4 text-primary" /></TooltipTrigger><TooltipContent>Earnings split between creators and platform</TooltipContent></Tooltip>
                Creator Earnings Split
              </CardTitle>
            </CardHeader>
            <CardContent>
              {earningsBreakdown.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={earningsBreakdown} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value" animationDuration={1200} animationEasing="ease-out">
                        {earningsBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <RechartsTooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`৳${v.toLocaleString()}`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {earningsBreakdown.map((e, i) => (
                      <div key={e.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground">{e.name}:</span>
                        <span className="font-medium">৳{e.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <EmptyState icon={Wallet} message="No earnings data yet" />}
            </CardContent>
          </Card>
        </div>

        {/* === SECTION 6: Content Performance === */}
        <div className={`grid md:grid-cols-3 gap-4 transition-all duration-700 delay-300 ${chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Card className="border-border/40">
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Tooltip><TooltipTrigger><TrendingUp className="h-4 w-4 text-primary" /></TooltipTrigger><TooltipContent>Most read books</TooltipContent></Tooltip>
              <CardTitle className="text-sm font-medium">Trending Books</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topBooks.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.topBooks.map((b, i) => (
                    <div key={i} className="flex items-center justify-between hover:bg-secondary/30 rounded px-1.5 py-1 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}</span>
                        <span className="text-sm truncate max-w-[140px]">{b.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{b.reads} reads</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={TrendingUp} message="No reading data" />}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Tooltip><TooltipTrigger><DollarSign className="h-4 w-4 text-emerald-400" /></TooltipTrigger><TooltipContent>Real profit per book (revenue minus creator cost)</TooltipContent></Tooltip>
              <CardTitle className="text-sm font-medium">Top Earning Books</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topEarningBooks.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.topEarningBooks.map((b, i) => (
                    <div key={i} className="flex items-center justify-between hover:bg-secondary/30 rounded px-1.5 py-1 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}</span>
                        <span className="text-sm truncate max-w-[120px]">{b.title}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium text-emerald-400">৳{b.profit.toLocaleString()}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">(rev ৳{b.revenue.toLocaleString()})</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={DollarSign} message="No earnings data" />}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Tooltip><TooltipTrigger><Star className="h-4 w-4 text-amber-400" /></TooltipTrigger><TooltipContent>Highest rated books</TooltipContent></Tooltip>
              <CardTitle className="text-sm font-medium">Top Rated</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topRatedBooks.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.topRatedBooks.map((b, i) => (
                    <div key={i} className="flex items-center justify-between hover:bg-secondary/30 rounded px-1.5 py-1 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}</span>
                        <span className="text-sm truncate max-w-[120px]">{b.title}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-amber-400">★ {b.rating}</span>
                        <span className="text-[10px] text-muted-foreground">({b.reviews})</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={Star} message="No ratings yet" />}
            </CardContent>
          </Card>
        </div>

        {/* === SECTION 7: Content Stats === */}
        <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 transition-all duration-700 delay-400 ${chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <MiniStat icon={BookOpen} label="Books" value={stats.totalBooks} tooltip="Total books" color="text-primary" onClick={() => navigate("/admin/books")} />
          <MiniStat icon={BookCopy} label="eBooks" value={stats.totalEbooks} tooltip="eBook formats" color="text-blue-400" onClick={() => navigate("/admin/books")} />
          <MiniStat icon={Headphones} label="Audiobooks" value={stats.totalAudiobooks} tooltip="Audiobook formats" color="text-purple-400" onClick={() => navigate("/admin/books")} />
          <MiniStat icon={Package} label="Hard Copies" value={stats.totalHardcopies} tooltip="Hardcopy formats" color="text-emerald-400" onClick={() => navigate("/admin/books")} />
          <MiniStat icon={Users} label="Authors" value={stats.totalAuthors} tooltip="Total authors" color="text-amber-400" onClick={() => navigate("/admin/authors")} />
          <MiniStat icon={Mic2} label="Narrators" value={stats.totalNarrators} tooltip="Total narrators" color="text-blue-400" onClick={() => navigate("/admin/narrators")} />
          <MiniStat icon={ArrowUpRight} label="Avg Rating" value={stats.topRatedBooks.length > 0 ? `★ ${(stats.topRatedBooks.reduce((s, b) => s + b.rating, 0) / stats.topRatedBooks.length).toFixed(1)}` : "—"} tooltip="Average book rating" color="text-amber-400" onClick={() => navigate("/admin/reviews")} />
        </div>

        {/* === SECTION 8: Recent Orders + Pending Approvals + Reviews === */}
        <div className={`grid md:grid-cols-3 gap-4 transition-all duration-700 delay-500 ${chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Card className="border-border/40">
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Tooltip><TooltipTrigger><ShoppingCart className="h-4 w-4 text-emerald-400" /></TooltipTrigger><TooltipContent>Latest orders</TooltipContent></Tooltip>
              <CardTitle className="text-sm font-medium">Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentOrders.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.recentOrders.map(o => (
                    <div key={o.id} className="flex items-center justify-between hover:bg-secondary/30 rounded px-1.5 py-1 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">#{o.id}</span>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 capitalize ${statusColor[o.status] || ""}`}>{o.status}</Badge>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium">৳{o.total}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">{o.created}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={ShoppingCart} message="No orders yet" />}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Tooltip><TooltipTrigger><UserCheck className="h-4 w-4 text-yellow-400" /></TooltipTrigger><TooltipContent>Creator role applications awaiting review</TooltipContent></Tooltip>
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.pendingApplications.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.pendingApplications.map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 hover:bg-secondary/30 rounded px-1.5 py-1 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-[9px] capitalize bg-amber-500/15 text-amber-400 animate-pulse shrink-0">{a.role}</Badge>
                        <span className="text-sm truncate max-w-[80px]">{a.user}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setSelectedApp(a)} className="h-6 w-6 p-0 hover:bg-primary/10 hover:border-primary/30 transition-colors">
                        <Eye className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={UserCheck} message="No pending applications" />}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Tooltip><TooltipTrigger><Star className="h-4 w-4 text-amber-400" /></TooltipTrigger><TooltipContent>Latest book reviews</TooltipContent></Tooltip>
              <CardTitle className="text-sm font-medium">Recent Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.pendingReviews.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.pendingReviews.map(r => (
                    <div key={r.id} className="flex items-center justify-between hover:bg-secondary/30 rounded px-1.5 py-1 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm truncate max-w-[120px]">{r.book}</span>
                        <span className="text-[10px] text-amber-400">{"★".repeat(r.rating)}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{r.date}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={Star} message="No reviews yet" />}
            </CardContent>
          </Card>
        </div>

        {/* Application Detail Dialog */}
        <Dialog open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Application Review
                {selectedApp && <Badge variant="outline" className="capitalize bg-primary/10 text-primary">{selectedApp.role}</Badge>}
              </DialogTitle>
              <DialogDescription>Review full details before approving or rejecting.</DialogDescription>
            </DialogHeader>
            {selectedApp && (
              <div className="space-y-4 mt-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={selectedApp.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg">
                      {(selectedApp.full_name || selectedApp.user)?.[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{selectedApp.full_name || selectedApp.user}</p>
                    {selectedApp.display_name && <p className="text-sm text-muted-foreground">{selectedApp.display_name}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs">Email</p><p>{selectedApp.email || "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Phone</p><p>{selectedApp.phone || "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Applied Role</p><p className="capitalize">{selectedApp.role}</p></div>
                  <div><p className="text-muted-foreground text-xs">Applied Date</p><p>{selectedApp.date}</p></div>
                </div>
                {selectedApp.bio && <div><p className="text-muted-foreground text-xs mb-1">Bio</p><p className="text-sm bg-muted/50 rounded p-2">{selectedApp.bio}</p></div>}
                {selectedApp.experience && <div><p className="text-muted-foreground text-xs mb-1">Experience</p><p className="text-sm bg-muted/50 rounded p-2">{selectedApp.experience}</p></div>}
                {selectedApp.message && <div><p className="text-muted-foreground text-xs mb-1">Message</p><p className="text-sm bg-muted/50 rounded p-2">{selectedApp.message}</p></div>}
                {(selectedApp.facebook_url || selectedApp.instagram_url || selectedApp.youtube_url || selectedApp.website_url || selectedApp.portfolio_url) && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Links</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedApp.facebook_url && <a href={selectedApp.facebook_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Facebook</a>}
                      {selectedApp.instagram_url && <a href={selectedApp.instagram_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Instagram</a>}
                      {selectedApp.youtube_url && <a href={selectedApp.youtube_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">YouTube</a>}
                      {selectedApp.website_url && <a href={selectedApp.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Website</a>}
                      {selectedApp.portfolio_url && <a href={selectedApp.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Portfolio</a>}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button className="flex-1 hover:shadow-md hover:shadow-emerald-500/10 transition-shadow" onClick={async () => { await handleApproval(selectedApp, "approved"); setSelectedApp(null); }}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button variant="destructive" className="flex-1 hover:shadow-md hover:shadow-destructive/10 transition-shadow" onClick={async () => { await handleApproval(selectedApp, "rejected"); setSelectedApp(null); }}>
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

/* ── Sub-components ── */

function StaggeredItem({ children, index }: { children: React.ReactNode; index: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50 + index * 60);
    return () => clearTimeout(t);
  }, [index]);
  return (
    <div className={`transition-all duration-500 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
      {children}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color, bgColor, onClick, tooltip, prefix, suffix }: {
  icon: any; label: string; value: string | number; color: string; bgColor: string;
  href?: string; onClick?: () => void; tooltip?: string; prefix?: string; suffix?: string;
}) {
  const numericValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[^\d.-]/g, ""));
  const isNumeric = !isNaN(numericValue) && typeof value === "number";
  const animated = useCountUp(isNumeric ? numericValue : 0, 1200, 200);
  const displayValue = isNumeric
    ? `${prefix || ""}${animated.toLocaleString()}${suffix || ""}`
    : `${prefix || ""}${value}${suffix || ""}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card
          className="border-border/40 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 active:scale-[0.97] transition-all duration-200 cursor-pointer group"
          onClick={onClick}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${bgColor} group-hover:scale-110 transition-transform duration-200`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold truncate">{displayValue}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
          </CardContent>
        </Card>
      </TooltipTrigger>
      {tooltip && <TooltipContent side="bottom"><p className="text-xs">{tooltip}</p></TooltipContent>}
    </Tooltip>
  );
}

function MiniStat({ icon: Icon, label, value, color, onClick, tooltip }: {
  icon: any; label: string; value: string | number; color: string; onClick?: () => void; tooltip?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="border-border/40 hover:border-primary/30 hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 cursor-pointer group" onClick={onClick}>
          <CardContent className="p-3 flex items-center gap-2">
            <Icon className={`h-3.5 w-3.5 ${color} shrink-0 group-hover:scale-110 transition-transform`} />
            <div className="min-w-0">
              <p className="text-sm font-bold">{value}</p>
              <p className="text-[9px] text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      {tooltip && <TooltipContent side="bottom"><p className="text-xs">{tooltip}</p></TooltipContent>}
    </Tooltip>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="p-3 rounded-full bg-secondary/50 mb-3">
        <Icon className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
