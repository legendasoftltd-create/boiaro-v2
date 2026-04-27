import { useRef } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Gift } from "lucide-react"
import { BookCard } from "./BookCard"
import { useBooks } from "@/hooks/useBooks"
import { useContentFilter } from "@/contexts/ContentFilterContext"
import { filterBooks } from "@/hooks/useBookFilter"

export function FreeBooks() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { freeBooks } = useBooks()
  const { globalFilter } = useContentFilter()
  const filtered = filterBooks(freeBooks, globalFilter)
  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" })
    }
  }

  if (filtered.length === 0) return null

  return (
    <section className="section-container bg-gradient-to-b from-green-500/[0.03] via-background to-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-green-500/10"><Gift className="w-5 h-5 text-green-500" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Free <span className="text-green-500">Books</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">No subscription required</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row stagger-children">
          {filtered.map((book) => <BookCard key={book.id} book={book} showPrice />)}
        </div>
         <div className="text-center mt-4 md:mt-8">
           <Link to="/books?filter=free"><Button className="bg-green-600 hover:bg-green-700 text-foreground h-9 md:h-10 px-5 md:px-6 rounded-xl font-semibold text-[12px] md:text-[13px] transition-all duration-200">Browse All Free Books</Button></Link>
        </div>
      </div>
    </section>
  )
}
