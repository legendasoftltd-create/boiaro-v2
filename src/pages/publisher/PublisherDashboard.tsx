import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Package, DollarSign, Wallet, Clock, Headphones } from "lucide-react";

export default function PublisherDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    books: 0, ebookRevenue: 0, audioRevenue: 0, hardcopyRevenue: 0,
    totalEarnings: 0, availableBalance: 0, pendingPayout: 0, withdrawn: 0,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [contribs, earnings, withdrawals] = await Promise.all([
        supabase.from("book_contributors").select("book_id").eq("user_id", user.id).eq("role", "publisher"),
        supabase.from("contributor_earnings").select("*").eq("user_id", user.id).eq("role", "publisher"),
        supabase.from("withdrawal_requests").select("*").eq("user_id", user.id),
      ]);
      const bookIds = [...new Set((contribs.data || []).map(c => c.book_id))];
      const allEarnings = earnings.data || [];
      const allWithdrawals = withdrawals.data || [];
      const totalEarnings = allEarnings.reduce((s, e) => s + Number(e.earned_amount), 0);
      const confirmed = allEarnings.filter(e => e.status === "confirmed").reduce((s, e) => s + Number(e.earned_amount), 0);
      const withdrawn = allWithdrawals.filter(w => w.status === "paid").reduce((s, w) => s + Number(w.amount), 0);
      const pendingW = allWithdrawals.filter(w => w.status === "pending" || w.status === "approved").reduce((s, w) => s + Number(w.amount), 0);

      setStats({
        books: bookIds.length,
        ebookRevenue: allEarnings.filter(e => e.format === "ebook").reduce((s, e) => s + Number(e.earned_amount), 0),
        audioRevenue: allEarnings.filter(e => e.format === "audiobook").reduce((s, e) => s + Number(e.earned_amount), 0),
        hardcopyRevenue: allEarnings.filter(e => e.format === "hardcopy").reduce((s, e) => s + Number(e.earned_amount), 0),
        totalEarnings,
        availableBalance: Math.max(0, confirmed - withdrawn - pendingW),
        pendingPayout: pendingW,
        withdrawn,
      });
    };
    load();
  }, [user]);

  const cards = [
    { label: "Published Books", value: stats.books, icon: BookOpen, color: "text-primary" },
    { label: "eBook Revenue", value: `৳${stats.ebookRevenue.toFixed(0)}`, icon: BookOpen, color: "text-blue-400" },
    { label: "Audiobook Revenue", value: `৳${stats.audioRevenue.toFixed(0)}`, icon: Headphones, color: "text-purple-400" },
    { label: "Hardcopy Revenue", value: `৳${stats.hardcopyRevenue.toFixed(0)}`, icon: Package, color: "text-orange-400" },
    { label: "Total Earnings", value: `৳${stats.totalEarnings.toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
    { label: "Available Balance", value: `৳${stats.availableBalance.toFixed(0)}`, icon: Wallet, color: "text-emerald-400" },
    { label: "Pending Payout", value: `৳${stats.pendingPayout.toFixed(0)}`, icon: Clock, color: "text-yellow-400" },
    { label: "Withdrawn", value: `৳${stats.withdrawn.toFixed(0)}`, icon: DollarSign, color: "text-blue-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold">Welcome, {profile?.display_name || "Publisher"}</h1>
        <p className="text-muted-foreground text-sm">Manage your publications and track revenue.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(s => (
          <Card key={s.label} className="border-border/30 bg-card/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-secondary ${s.color}`}>
                <s.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/30 bg-card/60">
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Your publishing activity and sales will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
