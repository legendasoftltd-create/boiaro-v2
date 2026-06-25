import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Languages, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toMediaUrl } from "@/lib/mediaUrl";

const REFETCH_MS = 60_000;

export default function TranslatorDashboard() {
  const { profile } = useAuth();
  const { data: books = [], isLoading: booksLoading, refetch } = trpc.books.myCreatorBooks.useQuery(
    { role: "translator" },
    { refetchInterval: REFETCH_MS, staleTime: 30_000 }
  );

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
          <h1 className="text-2xl font-serif font-bold">Welcome, {profile?.display_name || "Translator"}</h1>
          <p className="text-muted-foreground text-sm">Books you've been assigned to translate.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs h-8">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <Card className="border-border/30 bg-card/60 max-w-xs">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-secondary text-primary">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <p className="text-lg font-bold">{books.length}</p>
            <p className="text-[10px] text-muted-foreground">Total Books</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/30 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Languages className="w-4 h-4 text-primary" /> Your Translated Books
          </CardTitle>
        </CardHeader>
        <CardContent>
          {booksLoading ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted" />
              ))}
            </div>
          ) : books.length > 0 ? (
            <div className="space-y-2">
              {books.map((book: any) => (
                <Link key={book.id} to={`/book/${book.slug}`} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors">
                  {book.cover_url ? (
                    <img src={toMediaUrl(book.cover_url) || ""} alt="" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{book.title}</p>
                    {book.title_en && <p className="text-[10px] text-muted-foreground truncate">{book.title_en}</p>}
                  </div>
                  {statusBadge(book.submission_status || "pending")}
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Languages className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No books assigned yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">An admin will assign you as a translator on a book's Add/Edit page.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
