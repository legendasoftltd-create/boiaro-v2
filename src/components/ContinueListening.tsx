import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Headphones, Play } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBooks } from "@/hooks/useBooks";
import type { MasterBook } from "@/lib/types";

interface ListeningItem {
  book_id: string;
  current_track: number | null;
  percentage: number | null;
  total_duration: number | null;
  current_position: number | null;
  last_listened_at: string | null;
  book: MasterBook;
}

export function ContinueListening() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { books: allBooks } = useBooks();
  const [items, setItems] = useState<ListeningItem[]>([]);

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -340 : 340, behavior: "smooth" });

  useEffect(() => {
    if (!user || allBooks.length === 0) return;

    supabase
      .from("listening_progress")
      .select("*")
      .eq("user_id", user.id)
      .order("last_listened_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data) return;
        const bookMap = new Map(allBooks.map(b => [b.id, b]));
        const mapped = (data as any[])
          .map(p => {
            const book = bookMap.get(p.book_id);
            if (!book) return null;
            return { ...p, book } as ListeningItem;
          })
          .filter((p): p is ListeningItem => p !== null && (Number(p.percentage) || 0) < 100);
        setItems(mapped);
      });
  }, [user, allBooks.length]);

  if (items.length === 0) return null;

  return (
    <section className="py-4 md:py-10 lg:py-14">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-blue-500/10">
              <Headphones className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Continue <span className="text-blue-400">Listening</span>
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
              className="flex-shrink-0 w-[250px] md:w-[360px] snap-start group cursor-pointer"
              onClick={() => navigate(`/book/${item.book.slug}`)}
            >
               <div className="relative flex gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl bg-gradient-to-br from-blue-500/[0.08] via-card to-card border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
                 <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-lg md:rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-blue-500/30">
                   <img src={item.book.cover} alt={item.book.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                   <Badge variant="outline" className="w-fit border-blue-500/50 text-blue-400 text-[10px] md:text-xs mb-1 md:mb-2 rounded-md">
                     <Headphones className="w-2.5 h-2.5 md:w-3 md:h-3 mr-1" /> Audiobook
                  </Badge>
                  <h3 className="font-medium text-foreground line-clamp-1 text-[13px] group-hover:text-blue-400 transition-colors">
                    {item.book.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {item.book.formats.audiobook?.narrator.name || item.book.author.name}
                  </p>
                  <div className="mt-auto pt-2 md:pt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Track {item.current_track || 1}</span>
                      <span className="text-blue-400 font-semibold">{Math.round(Number(item.percentage) || 0)}%</span>
                    </div>
                    <Progress value={Number(item.percentage) || 0} className="h-1.5" />
                  </div>
                </div>
                <button className="absolute top-1/2 right-3 -translate-y-1/2 w-9 h-9 md:w-11 md:h-11 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                  <Play className="w-4 h-4 md:w-5 md:h-5 text-foreground fill-foreground ml-0.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
