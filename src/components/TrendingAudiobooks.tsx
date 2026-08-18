import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { BookCard } from "./BookCard";
import { SectionSearch } from "./SectionSearch";
import { trpc } from "@/lib/trpc";
import { trpcBookToMasterBook } from "@/hooks/useBooks";
import { useContentFilter } from "@/contexts/ContentFilterContext";

// Recent (14-day) unique-listener growth — distinct from Popular Audiobooks,
// which ranks by the generic, all-time, shared-with-ebooks total_reads
// counter. See server/src/services/books.service.ts's getTrendingAudiobookIds.
export function TrendingAudiobooks() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { globalFilter } = useContentFilter();
  const [search, setSearch] = useState("");
  const { data } = trpc.books.trendingAudiobooks.useQuery(
    { limit: 10, search: search || undefined },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );
  const books = (data || []).map(trpcBookToMasterBook);

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" });

  if (globalFilter !== "all" && globalFilter !== "audiobook") return null;
  if (books.length === 0 && !search.trim()) return null;

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-orange-500/10">
              <Flame className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Trending <span className="text-orange-400">Now</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">সাম্প্রতিক সবচেয়ে বেশি শোনা অডিওবুক</p>
            </div>
          </div>
          <div className="hidden lg:block">
            <SectionSearch value={search} onChange={setSearch} placeholder="Search trending audiobooks..." />
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
        {books.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No trending audiobooks match this search yet.</p>
        ) : (
        <div ref={scrollRef} className="scroll-row stagger-children">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
        )}
        <div className="text-center mt-5 md:mt-8">
          <Link to="/books?format=audiobook"><Button variant="outline" className="border-orange-500/40 text-orange-400 hover:bg-orange-500 hover:text-foreground h-10 px-6 rounded-xl font-semibold text-[13px] transition-all duration-200">সব দেখুন →</Button></Link>
        </div>
      </div>
    </section>
  );
}
