import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useBooks } from "@/hooks/useBooks";
import type { MasterBook } from "@/lib/types";

interface ProgressItem {
  book_id: string;
  current_page: number | null;
  total_pages: number | null;
  percentage: number | null;
  last_read_at: string | null;
  book: MasterBook;
}

export function ContinueReading() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { books: allBooks } = useBooks();
  const [items, setItems] = useState<ProgressItem[]>([]);

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -300 : 300, behavior: "smooth" });

  const { data: progressList = [] } = trpc.profiles.readingProgress.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    if (!user || allBooks.length === 0) return;
    const bookMap = new Map(allBooks.map(b => [b.id, b]));
    const mapped = (progressList as any[])
      .map(p => {
        const book = bookMap.get(p.book_id);
        if (!book) return null;
        return { ...p, book } as ProgressItem;
      })
      .filter((p): p is ProgressItem => p !== null && (p.percentage || 0) < 100)
      .slice(0, 10);
    setItems(mapped);
  }, [user, allBooks.length, progressList]);

  if (!user && items.length === 0) {
    return (
    <section className="py-4 md:py-10 lg:py-14">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="section-header">
          <div className="section-icon bg-primary/10">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Continue <span className="text-primary">Reading</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">Pick up where you left off</p>
            </div>
          </div>
          <div className="flex items-center justify-center h-[110px] rounded-xl bg-card/50 border border-dashed border-primary/20">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">Sign in to sync your reading progress</p>
              <Button size="sm" className="btn-gold-outline" onClick={() => navigate("/auth")}>
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="py-4 md:py-10 lg:py-14">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-primary/10">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Continue <span className="text-primary">Reading</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">Pick up where you left off</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-card text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-card text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row">
          {items.map((item) => (
            <div
              key={item.book_id}
              className="flex-shrink-0 w-[240px] md:w-[340px] snap-start group cursor-pointer"
              onClick={() => navigate(`/read/${item.book.slug}`)}
            >
               <div className="card-hover flex gap-3 p-3 md:p-4">
                 <div className="relative w-16 h-24 md:w-20 md:h-28 rounded-lg md:rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all">
                  <img src={item.book.cover} alt={item.book.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                   <Badge variant="outline" className="w-fit border-primary/50 text-primary text-[10px] md:text-xs mb-1 md:mb-2 rounded-md">
                     <BookOpen className="w-2.5 h-2.5 md:w-3 md:h-3 mr-1" /> eBook
                  </Badge>
                  <h3 className="font-medium text-foreground line-clamp-1 text-[13px] group-hover:text-primary transition-colors">
                    {item.book.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.book.author.name}</p>
                  <div className="mt-auto pt-2 md:pt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">
                        Page {item.current_page || 0} of {item.total_pages || item.book.formats.ebook?.pages || "?"}
                      </span>
                      <span className="text-primary font-semibold">{Math.round(Number(item.percentage) || 0)}%</span>
                    </div>
                    <Progress value={Number(item.percentage) || 0} className="h-1.5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
