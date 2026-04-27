import { useRef } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Clock, ChevronLeft, ChevronRight, Headphones, Star, User } from "lucide-react"
import { useBooks } from "@/hooks/useBooks"
import { useContentFilter } from "@/contexts/ContentFilterContext"
import { formatDuration } from "@/lib/duration"

export function Audiobooks() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { audiobooks: popularAudiobooks } = useBooks()
  const { globalFilter } = useContentFilter()

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" })
    }
  }

  // Hide this section if filter excludes audiobooks
  if (globalFilter !== "all" && globalFilter !== "audiobook") return null
  if (popularAudiobooks.length === 0) return null

  return (
    <section id="audiobooks" className="section-container bg-gradient-to-b from-blue-500/[0.03] via-background to-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-blue-500/10"><Headphones className="w-5 h-5 text-blue-400" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Popular <span className="text-blue-400">Audiobooks</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Listen to Bengali classics anywhere</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        <div ref={scrollRef} className="scroll-row stagger-children">
          {popularAudiobooks.map((book) => {
            const audiobook = book.formats.audiobook!
            const isFree = audiobook.price === 0
            return (
              <Link to={`/book/${book.slug}?tab=audiobook`} key={book.id} className="flex-shrink-0 w-[150px] md:w-[220px] snap-start group cursor-pointer no-underline">
                <div className="relative aspect-square rounded-xl md:rounded-2xl overflow-hidden mb-2 md:mb-3 bg-card shadow-md ring-1 ring-blue-500/15 group-hover:ring-blue-500/40 group-hover:shadow-xl group-hover:shadow-blue-500/[0.06] transition-all duration-300">
                  <img src={book.cover} alt={book.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-blue-500/90 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-500 transition-all duration-300 shadow-lg shadow-blue-500/25">
                      <Play className="w-6 h-6 text-foreground fill-foreground ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
                    <Badge className={`text-[11px] shadow-sm ${isFree ? "bg-green-600 text-foreground" : "bg-blue-500 text-foreground"}`}>{isFree ? "Free" : `৳${audiobook.price}`}</Badge>
                    <Badge className="bg-background/70 backdrop-blur-sm text-foreground border-0 text-[11px]"><Clock className="w-3 h-3 mr-1" />{formatDuration(audiobook.duration)}</Badge>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center ring-1 ring-blue-500/40"><User className="w-3 h-3 text-blue-400" /></div>
                      <span className="text-[11px] text-foreground truncate font-medium">{audiobook.narrator.name}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-0.5 px-0.5">
                  <h3 className="font-medium text-foreground line-clamp-1 text-[13px] group-hover:text-blue-400 transition-colors">{book.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{book.author.name}</p>
                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1"><Star className="w-3 h-3 fill-primary text-primary" /><span className="text-xs text-foreground font-medium">{book.rating}</span></div>
                    <div className="flex items-center gap-1 text-muted-foreground"><Headphones className="w-3 h-3" /><span className="text-[11px]">{book.totalReads}</span></div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
         <div className="text-center mt-4 md:mt-8">
           <Link to="/books?format=audiobook"><Button variant="outline" className="border-blue-500/40 text-blue-400 hover:bg-blue-500 hover:text-foreground h-9 md:h-10 px-5 md:px-6 rounded-xl font-semibold text-[12px] md:text-[13px] transition-all duration-200">Explore All Audiobooks</Button></Link>
        </div>
      </div>
    </section>
  )
}
