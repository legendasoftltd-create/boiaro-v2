import { useState, useRef, useEffect } from "react";
import { X, Loader2, BookOpen, Star, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useNavigate } from "react-router-dom";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { toMediaUrl } from "@/lib/mediaUrl";

interface SearchResult {
  id: string;
  title: string;
  title_en?: string;
  slug: string;
  cover_url?: string;
  rating?: number;
  is_free?: boolean;
  authors?: { name: string } | null;
  categories?: { name: string } | null;
}

export function SmartSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { trackSearch } = useActivityTracker();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      clearTimeout(debounceRef.current);
      setQuery("");
      setResults([]);
      setSearched(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const utils = trpc.useUtils();

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }
    setLoading(true);
    setSearched(true);
    setError(null);

    try {
      const data = await utils.books.list.fetch({ search: q.trim(), limit: 15 });
      const books = (data?.books ?? []) as any[];
      const mapped: SearchResult[] = books.map((b: any) => ({
        id: b.id,
        title: b.title,
        title_en: b.title_en,
        slug: b.slug,
        cover_url: toMediaUrl(b.cover_url),
        rating: b.rating ? Number(b.rating) : undefined,
        is_free: b.is_free,
        authors: b.author ? { name: b.author.name } : null,
        categories: b.category ? { name: b.category.name } : null,
      }));
      setResults(mapped);
      trackSearch(q.trim(), mapped.length);
    } catch {
      setResults([]);
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 600);
  };

  const goToBook = (slug: string) => {
    onOpenChange(false);
    navigate(`/book/${slug}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <Input
            ref={inputRef}
            placeholder="Search books in Bangla or English..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                clearTimeout(debounceRef.current);
                doSearch(query);
              }
            }}
            className="border-0 shadow-none focus-visible:ring-0 text-base h-10 px-0"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
          {query && !loading && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setQuery(""); setResults([]); setSearched(false); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!searched && !loading && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary/40" />
              <p>AI-powered search — try "love story", "রোমাঞ্চ", or any topic</p>
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No books found for "{query}"
            </div>
          )}
          {error && (
            <div className="px-6 pb-4 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {results.map((book) => (
            <button
              key={book.id}
              onClick={() => goToBook(book.slug)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left border-b border-border/20 last:border-0"
            >
              {book.cover_url ? (
                <img src={book.cover_url} alt="" className="w-10 h-14 rounded object-cover shrink-0" />
              ) : (
                <div className="w-10 h-14 rounded bg-secondary flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{book.title}</p>
                {book.title_en && <p className="text-xs text-muted-foreground truncate">{book.title_en}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  {book.authors?.name && <span className="text-xs text-muted-foreground">{book.authors.name}</span>}
                  {book.categories?.name && <Badge variant="outline" className="text-[9px] px-1 py-0">{book.categories.name}</Badge>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {book.rating ? (
                  <span className="flex items-center gap-0.5 text-xs text-primary">
                    <Star className="h-3 w-3 fill-primary" /> {Number(book.rating).toFixed(1)}
                  </span>
                ) : null}
                {book.is_free && <Badge className="text-[9px] px-1.5 py-0 bg-green-500/20 text-green-400 border-0">Free</Badge>}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
