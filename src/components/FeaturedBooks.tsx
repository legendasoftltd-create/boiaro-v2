import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { BookCard } from "./BookCard"
import { ContentToggle } from "./ContentToggle"
import { useBooks } from "@/hooks/useBooks"
import { useBookFilter, filterBooks } from "@/hooks/useBookFilter"

type ContentType = "all" | "ebook" | "audiobook" | "hardcopy"

export function FeaturedBooks() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [localContentType, setLocalContentType] = useState<ContentType>("all")
  const activeFilter = useBookFilter(localContentType)
  const { newReleases, books, loading } = useBooks()

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" })
    }
  }

  const sourceBooks = newReleases.length > 0 ? newReleases : books
  const filteredBooks = filterBooks(sourceBooks, activeFilter)

  if (loading || filteredBooks.length === 0) return null

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
              <ContentToggle value={localContentType} onChange={setLocalContentType} />
            </div>
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row stagger-children">
          {filteredBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
         <div className="text-center mt-4 md:mt-8">
           <Link to="/books?filter=new"><Button variant="outline" className="btn-gold-outline h-9 md:h-10 px-5 md:px-6 text-[12px] md:text-[13px]">View All Books</Button></Link>
         </div>
      </div>
    </section>
  )
}
