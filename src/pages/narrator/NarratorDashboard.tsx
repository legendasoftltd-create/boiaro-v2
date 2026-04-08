import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic2, Headphones, DollarSign, Wallet, Clock, CheckCircle, FileAudio } from "lucide-react";
import { Link } from "react-router-dom";

export default function NarratorDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    audiobooks: 0, approved: 0, pending: 0, rejected: 0, drafts: 0,
    audioSales: 0, totalEarnings: 0, availableBalance: 0, pendingPayout: 0, withdrawn: 0,
  });
  const [recentBooks, setRecentBooks] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [booksRes, earnings, withdrawals] = await Promise.all([
        supabase.from("books").select("id, title, cover_url, submission_status, created_at").eq("submitted_by", user.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("contributor_earnings").select("*").eq("user_id", user.id).eq("role", "narrator"),
        supabase.from("withdrawal_requests").select("*").eq("user_id", user.id),
      ]);

      const books = booksRes.data || [];
      setRecentBooks(books);

      const allEarnings = earnings.data || [];
      const allWithdrawals = withdrawals.data || [];
      const totalEarnings = allEarnings.reduce((s, e) => s + Number(e.earned_amount), 0);
      const confirmed = allEarnings.filter(e => e.status === "confirmed").reduce((s, e) => s + Number(e.earned_amount), 0);
      const withdrawn = allWithdrawals.filter(w => w.status === "paid").reduce((s, w) => s + Number(w.amount), 0);
      const pendingW = allWithdrawals.filter(w => w.status === "pending" || w.status === "approved").reduce((s, w) => s + Number(w.amount), 0);

      // Get all books submitted by this user to count statuses
      const { data: allBooks } = await supabase.from("books").select("id, submission_status").eq("submitted_by", user.id);
      const ab = allBooks || [];

      setStats({
        audiobooks: ab.length,
        approved: ab.filter(b => b.submission_status === "approved").length,
        pending: ab.filter(b => b.submission_status === "pending").length,
        rejected: ab.filter(b => b.submission_status === "rejected").length,
        drafts: ab.filter(b => b.submission_status === "draft").length,
        audioSales: allEarnings.filter(e => e.format === "audiobook").length,
        totalEarnings,
        availableBalance: Math.max(0, confirmed - withdrawn - pendingW),
        pendingPayout: pendingW,
        withdrawn,
      });
    };
    load();
  }, [user]);

  const statCards = [
    { label: "Total Audiobooks", value: stats.audiobooks, icon: FileAudio, color: "text-primary" },
    { label: "Approved", value: stats.approved, icon: CheckCircle, color: "text-emerald-400" },
    { label: "Pending Review", value: stats.pending, icon: Clock, color: "text-yellow-400" },
    { label: "Audiobook Sales", value: stats.audioSales, icon: Headphones, color: "text-blue-400" },
    { label: "Total Earnings", value: `৳${stats.totalEarnings.toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
    { label: "Available Balance", value: `৳${stats.availableBalance.toFixed(0)}`, icon: Wallet, color: "text-primary" },
    { label: "Pending Payout", value: `৳${stats.pendingPayout.toFixed(0)}`, icon: Clock, color: "text-yellow-400" },
    { label: "Withdrawn", value: `৳${stats.withdrawn.toFixed(0)}`, icon: DollarSign, color: "text-blue-400" },
  ];

  const statusBadge = (status: string) => {
    const config: Record<string, string> = {
      draft: "bg-secondary text-muted-foreground border-border/30",
      pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      rejected: "bg-destructive/20 text-destructive border-destructive/30",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${config[status] || ""}`}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold">Welcome, {profile?.display_name || "Narrator"}</h1>
        <p className="text-muted-foreground text-sm">Manage your audiobook narrations and earnings.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(s => (
          <Card key={s.label} className="border-border/30 bg-card/60">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-secondary ${s.color}`}>
                <s.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-bold leading-tight">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/30 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Submissions</CardTitle>
            <Link to="/narrator/audiobooks" className="text-xs text-primary hover:underline">View All</Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentBooks.length > 0 ? (
            <div className="space-y-2">
              {recentBooks.map(book => (
                <div key={book.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/20">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt="" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                      <Mic2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{book.title}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(book.created_at).toLocaleDateString()}</p>
                  </div>
                  {statusBadge(book.submission_status || "pending")}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No submissions yet. Start uploading audiobooks!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
