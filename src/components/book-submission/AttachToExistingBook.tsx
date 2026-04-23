import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Link2, Loader2, Image, AlertCircle } from "lucide-react";

interface AttachToExistingBookProps {
  onSelect: (book: { id: string; title: string; cover_url: string | null }) => void;
  onCancel: () => void;
  format: "ebook" | "audiobook" | "hardcopy";
}

export function AttachToExistingBook({ onSelect, onCancel, format }: AttachToExistingBookProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const { data: results = [], isLoading } = trpc.books.searchApprovedBooks.useQuery(
    { query: debouncedQuery, format },
    { enabled: debouncedQuery.length >= 1 }
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const timer = setTimeout(() => setDebouncedQuery(value), 300);
    return () => clearTimeout(timer);
  };

  const searched = debouncedQuery.length >= 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Search Existing Books</h3>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs h-7">
          ← Back
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Search by Bangla or English title..."
          className="pl-9"
          autoFocus
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Search approved books to attach your <span className="font-medium capitalize">{format}</span> format.
      </p>

      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && searched && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No approved books found. Try a different search term.
        </p>
      )}

      {!isLoading && results.length > 0 && (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {results.map(book => {
            const disabled = book.hasFormat;
            return (
              <Card
                key={book.id}
                className={`border-border/30 transition-colors ${
                  disabled
                    ? "bg-muted/30 opacity-60 cursor-not-allowed"
                    : "bg-card/60 hover:bg-accent/30 cursor-pointer"
                }`}
                onClick={() => !disabled && onSelect({ id: book.id, title: book.title, cover_url: book.cover_url })}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt="" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                      <Image className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{book.title}</p>
                    {book.title_en && (
                      <p className="text-xs text-muted-foreground truncate">{book.title_en}</p>
                    )}
                    {book.author?.name && (
                      <p className="text-xs text-muted-foreground truncate">✍️ {book.author.name}</p>
                    )}
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {book.existingFormats.map((f) => (
                        <Badge key={f} variant="outline" className="text-[9px] capitalize">{f}</Badge>
                      ))}
                    </div>
                  </div>
                  {disabled ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <AlertCircle className="h-3 w-3" />
                      <span className="capitalize">{format} exists</span>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0">
                      <Link2 className="h-3 w-3" /> Attach
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
