import { useRef } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Mic2, ChevronLeft, ChevronRight, Headphones, Star } from "lucide-react"
import { useNarrators } from "@/hooks/useBooks"

export function Narrators() {
  const narrators = useNarrators()
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -260 : 260, behavior: "smooth" })
    }
  }

  return (
    <section id="narrators" className="section-container bg-gradient-to-b from-blue-500/[0.03] via-background to-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-blue-500/10"><Mic2 className="w-5 h-5 text-blue-400" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Featured <span className="text-blue-400">Narrators</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Voices that bring stories to life</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row stagger-children">
          {narrators.map((narrator) => (
             <Link to={`/narrator/${narrator.id}`} key={narrator.id} className="flex-shrink-0 w-[130px] md:w-[185px] snap-start group cursor-pointer">
               <div className="relative text-center">
                 <div className="relative w-20 h-20 md:w-28 md:h-28 mx-auto mb-2 md:mb-3">
                  <div className="relative w-full h-full rounded-full overflow-hidden ring-2 ring-blue-500/20 group-hover:ring-blue-500/50 transition-colors duration-300">
                    <img src={narrator.avatar} alt={narrator.nameEn} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <button className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/25 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                    <Play className="w-4 h-4 text-foreground fill-foreground ml-0.5" />
                  </button>
                  {narrator.isFeatured && <Badge className="absolute -top-1 -right-1 bg-blue-500 text-foreground text-[9px] px-1.5 py-0 shadow-sm">TOP</Badge>}
                </div>
                <h3 className="font-medium text-foreground text-[13px] group-hover:text-blue-400 transition-colors line-clamp-1 mb-0.5">{narrator.name}</h3>
                <p className="text-[11px] text-muted-foreground mb-1.5 line-clamp-1">{narrator.specialty}</p>
                <div className="flex items-center justify-center gap-3 text-[11px]">
                  <span className="flex items-center gap-0.5 text-muted-foreground" title="Audiobooks"><Headphones className="w-3 h-3" />{narrator.audiobooksCount}</span>
                  <span className="flex items-center gap-0.5 text-muted-foreground" title="Rating"><Star className="w-3 h-3 fill-primary text-primary" />{narrator.rating}</span>
                  <span className="text-blue-400 font-medium" title="Followers">{narrator.listeners}</span>
                </div>
               </div>
            </Link>
          ))}
        </div>
         <div className="text-center mt-4 md:mt-8">
           <Link to="/narrators"><Button variant="outline" className="border-blue-500/40 text-blue-400 hover:bg-blue-500 hover:text-foreground h-9 md:h-10 px-5 md:px-6 rounded-xl font-semibold text-[12px] md:text-[13px] transition-all duration-200">View All Narrators</Button></Link>
        </div>
      </div>
    </section>
  )
}
