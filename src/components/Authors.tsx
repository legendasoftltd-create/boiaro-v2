import { useRef } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, BookOpen, Sparkles, Users } from "lucide-react"
import { useAuthors } from "@/hooks/useBooks"

export function Authors() {
  const authors = useAuthors()
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -280 : 280, behavior: "smooth" })
    }
  }

  return (
    <section id="authors" className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-5 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-primary/10"><Sparkles className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Author <span className="text-primary">Spotlight</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Legendary Bengali writers</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row stagger-children">
          {authors.map((author) => (
            <Link to={`/author/${author.id}`} key={author.id} className="flex-shrink-0 w-[120px] md:w-[170px] snap-start group cursor-pointer text-center">
              <div className="relative w-20 h-20 md:w-28 md:h-28 mx-auto mb-2 md:mb-3">
                <div className="relative w-full h-full rounded-full overflow-hidden ring-2 ring-border/60 group-hover:ring-primary/50 transition-all duration-300">
                  <img src={author.avatar} alt={author.nameEn} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                </div>
                {author.isFeatured && <Badge className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] whitespace-nowrap px-2 py-0 shadow-sm">Featured</Badge>}
              </div>
              <h3 className="font-medium text-foreground text-[13px] group-hover:text-primary transition-colors line-clamp-1">{author.name}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{author.genre}</p>
              <div className="flex items-center justify-center gap-3 mt-1.5 text-muted-foreground">
                <span className="flex items-center gap-0.5 text-[11px]" title="Books"><BookOpen className="w-3 h-3" />{author.booksCount}</span>
                <span className="flex items-center gap-0.5 text-[11px]" title="Followers"><Users className="w-3 h-3" />{author.followers}</span>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-5 md:mt-8">
          <Link to="/authors"><Button variant="outline" className="btn-gold-outline h-10 px-6 text-[13px]">View All Authors</Button></Link>
        </div>
      </div>
    </section>
  )
}
