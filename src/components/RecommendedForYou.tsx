import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { BookCard } from "./BookCard";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useBooks } from "@/hooks/useBooks";
import type { MasterBook } from "@/lib/types";
import { useContentFilter } from "@/contexts/ContentFilterContext";
import { filterBooks } from "@/hooks/useBookFilter";

export function RecommendedForYou() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { trending } = useBooks();
  const { globalFilter } = useContentFilter();

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" });

  const { data: recData, isLoading } = trpc.books.recommendations.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const recBooks = (recData as MasterBook[] | undefined) ?? [];
  const loading = isLoading;

  const displayBooks = filterBooks(
    recBooks.length > 0 ? recBooks : trending.slice(0, 8),
    globalFilter
  );

  if (displayBooks.length === 0 && !loading) return null;

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-purple-500/10">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                {user ? "Recommended " : "Popular "}
                <span className="text-purple-400">{user ? "For You" : "Books"}</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {user ? "Personalized picks based on your taste" : "Discover what readers love"}
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
        ) : (
          <div ref={scrollRef} className="scroll-row stagger-children">
            {displayBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
