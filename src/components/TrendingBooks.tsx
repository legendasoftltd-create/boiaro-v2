import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Flame } from "lucide-react"
import { BookCard } from "./BookCard"
import { ContentToggle } from "./ContentToggle"
import { SectionSearch } from "./SectionSearch"
import { useBooks } from "@/hooks/useBooks"
import { toServerFormat } from "@/hooks/useBookFilter"
import type { ContentType } from "@/contexts/ContentFilterContext"

export function TrendingBooks() {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Independent of every other section's filter/search — both only control Trending Now.
  const [localFilter, setLocalFilter] = useState<ContentType>("all")
  const [search, setSearch] = useState("")
  const { trending } = useBooks(toServerFormat(localFilter), search)

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" })
    }
  }

  const filteredBooks = trending
  const isFiltering = localFilter !== "all" || search.trim() !== ""

  // Only hide the whole section when there's genuinely nothing to show by default — once
  // the user is actively filtering/searching, keep the header (and its controls) visible
  // even with zero matches, so there's always a way back to "All"/cleared search.
  if (filteredBooks.length === 0 && !isFiltering) return null

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="relative">
              <div className="section-icon bg-orange-500/10"><Flame className="w-5 h-5 text-orange-500" /></div>
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Trending <span className="text-orange-500">Now</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Most popular this week</p>
            </div>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
            <div className="hidden lg:block">
              <ContentToggle value={localFilter} onChange={setLocalFilter} />
            </div>
            <div className="hidden lg:block">
              <SectionSearch value={search} onChange={setSearch} placeholder="Search trending..." />
            </div>
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
        {filteredBooks.length > 0 ? (
          <div ref={scrollRef} className="scroll-row stagger-children">
            {filteredBooks.map((book, index) => (
              <div key={book.id} className="relative">
                <div className="absolute -left-1 -top-1 z-10 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/30 ring-2 ring-background">
                  <span className="text-[10px] font-bold text-foreground">{index + 1}</span>
                </div>
                <BookCard book={book} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6">No books match this filter yet.</p>
        )}
        <div className="text-center mt-5 md:mt-8">
          <Link to="/books?filter=trending"><Button variant="outline" className="border-orange-500/40 text-orange-500 hover:bg-orange-500 hover:text-foreground h-10 px-6 rounded-xl font-semibold text-[13px] transition-all duration-200">View All Trending</Button></Link>
        </div>
      </div>
    </section>
  )
}
