import { stripHtml } from "@/lib/stripHtml";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Image, Loader2 } from "lucide-react";

export default function TranslatorBooks() {
  const { data: books = [], isLoading, isError } = trpc.books.myCreatorBooks.useQuery({ role: "translator" });

  const statusBadge = (status: string) => {
    const config: Record<string, { cls: string; label: string }> = {
      draft: { cls: "bg-secondary text-muted-foreground border-border/30", label: "Draft" },
      pending: { cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "Pending Review" },
      approved: { cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Approved" },
      rejected: { cls: "bg-destructive/20 text-destructive border-destructive/30", label: "Rejected" },
    };
    const c = config[status] || config.pending;
    return <Badge variant="outline" className={`text-[10px] ${c.cls}`}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold">My Books</h1>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <Card className="border-destructive/30 bg-card/60">
          <CardContent className="text-center py-10 text-destructive">
            <p className="text-sm">Failed to load your books. Please refresh the page.</p>
          </CardContent>
        </Card>
      ) : books.length > 0 ? (
        <div className="grid gap-4">
          {(books as any[]).map((book: any) => (
            <Card key={book.id} className="border-border/30 bg-card/60">
              <CardContent className="p-4 flex gap-4">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" className="w-16 h-24 object-cover rounded" />
                ) : (
                  <div className="w-16 h-24 bg-muted rounded flex items-center justify-center">
                    <Image className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{book.title}</h3>
                    {statusBadge(book.submission_status || "pending")}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{book.category?.name_bn || book.category?.name || "No category"}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{stripHtml(book.description) || "No description"}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/30 bg-card/60">
          <CardContent className="text-center py-10 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No books assigned yet. An admin will assign you to books you've translated.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
