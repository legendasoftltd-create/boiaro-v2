import { useRef } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, BookOpen, Languages, Users } from "lucide-react"
import { useTranslators } from "@/hooks/useBooks"

export function Translators() {
  const translators = useTranslators()
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -280 : 280, behavior: "smooth" })
    }
  }

  if (translators.length === 0) return null

  return (
    <section id="translators" className="section-container bg-gradient-to-b from-green-500/[0.03] via-background to-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-5 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-green-500/10"><Languages className="w-5 h-5 text-green-400" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Translator <span className="text-green-400">Spotlight</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Bringing stories across languages</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row stagger-children">
          {translators.map((translator) => (
            <Link to={`/translator/${translator.id}`} key={translator.id} className="flex-shrink-0 w-[120px] md:w-[170px] snap-start group cursor-pointer text-center">
              <div className="relative w-20 h-20 md:w-28 md:h-28 mx-auto mb-2 md:mb-3">
                <div className="relative w-full h-full rounded-full overflow-hidden ring-2 ring-border/60 group-hover:ring-green-500/50 transition-all duration-300">
                  <img src={translator.avatar} alt={translator.nameEn} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                </div>
                {translator.isFeatured && <Badge className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-green-500 text-foreground text-[9px] whitespace-nowrap px-2 py-0 shadow-sm">Featured</Badge>}
              </div>
              <h3 className="font-medium text-foreground text-[13px] group-hover:text-green-400 transition-colors line-clamp-1">{translator.name}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{translator.genre}</p>
              <div className="flex items-center justify-center gap-3 mt-1.5 text-muted-foreground">
                <span className="flex items-center gap-0.5 text-[11px]" title="Books"><BookOpen className="w-3 h-3" />{translator.booksCount}</span>
                <span className="flex items-center gap-0.5 text-[11px]" title="Followers"><Users className="w-3 h-3" />{translator.followers}</span>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-5 md:mt-8">
          <Link to="/translators"><Button variant="outline" className="border-green-500/40 text-green-400 hover:bg-green-500 hover:text-foreground h-10 px-6 text-[13px]">View All Translators</Button></Link>
        </div>
      </div>
    </section>
  )
}
