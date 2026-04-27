import { useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, Star, BookOpen } from "lucide-react";
import { useRecentlyViewed } from "@/hooks/useRecommendations";

export function RecentlyViewed() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { books, loading } = useRecentlyViewed();

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" });

  if (loading || books.length === 0) return null;

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-orange-500/10">
              <Clock className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Recently <span className="text-orange-400">Viewed</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Books you looked at recently</p>
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

        <div ref={scrollRef} className="scroll-row stagger-children">
          {books.map((book) => (
            <Link
              key={book.id}
              to={`/book/${book.slug}`}
              className="flex-shrink-0 w-[130px] md:w-[190px] snap-start group"
            >
              <div className="relative aspect-[2/3] rounded-xl md:rounded-2xl overflow-hidden mb-2 md:mb-3 bg-card shadow-md ring-1 ring-border/40 group-hover:ring-primary/30 group-hover:shadow-xl transition-all duration-300">
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <BookOpen className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-0.5 px-0.5">
                <h3 className="font-medium text-foreground line-clamp-1 text-[13px] group-hover:text-primary transition-colors">{book.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-1">{(book.authors as any)?.name || ""}</p>
                {book.rating ? (
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-primary text-primary" />
                    <span className="text-xs text-foreground font-medium">{book.rating}</span>
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
