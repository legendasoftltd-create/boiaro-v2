import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, DollarSign, Headphones, Package, Wallet, Clock, RefreshCw, Pen } from "lucide-react";
import { Link } from "react-router-dom";
import { toMediaUrl } from "@/lib/mediaUrl";

const REFETCH_MS = 60_000;

export default function WriterDashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.profiles.creatorStats.useQuery(
    { role: "writer" },
    { refetchInterval: REFETCH_MS, staleTime: 30_000 }
  );
  const { data: recentBooks = [], isLoading: booksLoading, refetch: refetchBooks } = trpc.profiles.mySubmittedBooks.useQuery(
    undefined,
    { refetchInterval: REFETCH_MS, staleTime: 30_000 }
  );

  const loading = statsLoading || booksLoading;

  const handleRefresh = () => { refetchStats(); refetchBooks(); };

  const cards = [
    { label: "Total Books", value: stats?.bookCount ?? 0, icon: BookOpen, color: "text-primary" },
    { label: "eBook Sales", value: stats?.salesByFormat.ebook ?? 0, icon: BookOpen, color: "text-blue-400" },
    { label: "Audiobook Sales", value: stats?.salesByFormat.audiobook ?? 0, icon: Headphones, color: "text-purple-400" },
    { label: "Hardcopy Sales", value: stats?.salesByFormat.hardcopy ?? 0, icon: Package, color: "text-orange-400" },
    { label: "Total Earnings", value: `৳${(stats?.totalEarnings ?? 0).toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
    { label: "Available Balance", value: `৳${(stats?.availableBalance ?? 0).toFixed(0)}`, icon: Wallet, color: "text-emerald-400" },
    { label: "Pending Payout", value: `৳${(stats?.pendingPayout ?? 0).toFixed(0)}`, icon: Clock, color: "text-yellow-400" },
    { label: "Withdrawn", value: `৳${(stats?.withdrawn ?? 0).toFixed(0)}`, icon: DollarSign, color: "text-blue-400" },
  ];

  const statusBadge = (status: string) => {
    const cfg: Record<string, string> = {
      draft: "bg-secondary text-muted-foreground border-border/30",
      pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      rejected: "bg-destructive/20 text-destructive border-destructive/30",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${cfg[status] || ""}`}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-serif font-bold">Welcome, {profile?.display_name || "Writer"}</h1>
          <p className="text-muted-foreground text-sm">Track your books, sales, and earnings.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5 text-xs h-8">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
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
      )}

      {/* Recent submissions */}
      <Card className="border-border/30 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Pen className="w-4 h-4 text-primary" /> Recent Submissions
            </CardTitle>
            <Link to="/creator/books" className="text-xs text-primary hover:underline">View All</Link>
          </div>
        </CardHeader>
        <CardContent>
          {booksLoading ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted" />
              ))}
            </div>
          ) : recentBooks.length > 0 ? (
            <div className="space-y-2">
              {recentBooks.slice(0, 5).map(book => (
                <div key={book.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/20">
                  {book.cover_url ? (
                    <img src={toMediaUrl(book.cover_url) || ""} alt="" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
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
            <div className="text-center py-6">
              <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No book submissions yet.</p>
              <Link to="/creator/books">
                <Button size="sm" className="mt-3 text-xs">Submit Your First Book</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
