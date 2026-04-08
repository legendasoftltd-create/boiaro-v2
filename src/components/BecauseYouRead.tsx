import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, BookMarked } from "lucide-react";
import { BookCard } from "./BookCard";
import { useBecauseYouRead } from "@/hooks/useRecommendations";
import type { MasterBook } from "@/lib/types";
import { useContentFilter } from "@/contexts/ContentFilterContext";
import { filterBooks } from "@/hooks/useBookFilter";

interface Props {
  allBooks: MasterBook[];
}

export function BecauseYouRead({ allBooks }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { sourceBook, recommendations } = useBecauseYouRead(allBooks);
  const { globalFilter } = useContentFilter();
  const filtered = filterBooks(recommendations, globalFilter);

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" });

  if (!sourceBook || filtered.length === 0) return null;

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-emerald-500/10">
              <BookMarked className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Because You Read{" "}
                <span className="text-emerald-400 line-clamp-1 inline">{sourceBook.title}</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Similar books you might enjoy</p>
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
          {filtered.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      </div>
    </section>
  );
}
