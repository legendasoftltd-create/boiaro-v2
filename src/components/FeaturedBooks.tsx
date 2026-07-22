import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { BookCard } from "./BookCard"
import { ContentToggle } from "./ContentToggle"
import { SectionSearch } from "./SectionSearch"
import { useBooks } from "@/hooks/useBooks"
import { toServerFormat } from "@/hooks/useBookFilter"
import type { ContentType } from "@/contexts/ContentFilterContext"

export function FeaturedBooks() {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Independent of every other section's filter/search — both only control New Releases.
  const [localFilter, setLocalFilter] = useState<ContentType>("all")
  const [search, setSearch] = useState("")
  const { newReleases, books, loading } = useBooks(toServerFormat(localFilter), search)

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" })
    }
  }

  const filteredBooks = newReleases.length > 0 ? newReleases : books
  const isFiltering = localFilter !== "all" || search.trim() !== ""

  if (loading) return null
  if (filteredBooks.length === 0 && !isFiltering) return null

  return (
    <section id="books" className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-primary/10">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">New <span className="text-primary">Releases</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Fresh additions to our library</p>
            </div>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
            <div className="hidden lg:block">
              <ContentToggle value={localFilter} onChange={setLocalFilter} />
            </div>
            <div className="hidden lg:block">
              <SectionSearch value={search} onChange={setSearch} placeholder="Search new releases..." />
            </div>
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
        {filteredBooks.length > 0 ? (
          <div ref={scrollRef} className="scroll-row stagger-children">
            {filteredBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6">No books match this filter yet.</p>
        )}
         <div className="text-center mt-4 md:mt-8">
           <Link to="/books?filter=new"><Button variant="outline" className="btn-gold-outline h-9 md:h-10 px-5 md:px-6 text-[12px] md:text-[13px]">View All Books</Button></Link>
         </div>
      </div>
    </section>
  )
}
