import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Headphones } from "lucide-react";
import { BookCard } from "./BookCard";
import { SectionSearch } from "./SectionSearch";
import { trpc } from "@/lib/trpc";
import { trpcBookToMasterBook } from "@/hooks/useBooks";
import { useContentFilter } from "@/contexts/ContentFilterContext";

export function PopularAudiobooks() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { globalFilter } = useContentFilter();
  // Independent of every other section's search — only narrows Popular Audiobooks.
  const [search, setSearch] = useState("");
  const { data } = trpc.books.browseBooks.useQuery(
    { format: "audiobook", sort: "popular", pageSize: 10, query: search || undefined },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );
  const books = (data?.books || []).map(trpcBookToMasterBook);

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" });

  // Hide this section if filter excludes audiobooks
  if (globalFilter !== "all" && globalFilter !== "audiobook") return null;
  if (books.length === 0 && !search.trim()) return null;

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-violet-500/10">
              <Headphones className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Popular <span className="text-violet-400">Audiobooks</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Most listened audiobooks this week</p>
            </div>
          </div>
          <div className="hidden lg:block">
            <SectionSearch value={search} onChange={setSearch} placeholder="Search audiobooks..." />
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
          <p className="text-sm text-muted-foreground py-6">No audiobooks match this search yet.</p>
        ) : (
        <div ref={scrollRef} className="scroll-row stagger-children">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
        )}
      </div>
    </section>
  );
}
