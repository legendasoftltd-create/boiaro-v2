import { useRef } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Grid, BookOpen, Heart, Sword, Ghost, Sparkles, GraduationCap, Baby, History, Lightbulb, Music, Globe, Feather } from "lucide-react"
import { useCategories } from "@/hooks/useBooks"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen, Heart, Sword, Ghost, Sparkles, GraduationCap, Baby, History, Lightbulb, Music, Globe, Feather,
}

export function Categories() {
  const categories = useCategories()
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -280 : 280, behavior: "smooth" })
    }
  }

  return (
    <section id="categories" className="section-container bg-secondary/15">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-5 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-primary/10"><Grid className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Browse by <span className="text-primary">Category</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Find your next favorite read</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        <div ref={scrollRef} className="scroll-row stagger-children">
          {categories.map((category) => {
            const Icon = iconMap[category.icon] || BookOpen
            return (
              <div key={category.id} className="flex-shrink-0 snap-start group cursor-pointer">
                <div className={`relative w-24 md:w-32 p-3 md:p-4 rounded-xl md:rounded-2xl bg-gradient-to-br ${category.color} border border-border/40 hover:border-primary/30 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg hover:shadow-primary/[0.04]`}>
                  <div className="w-10 h-10 rounded-xl bg-background/40 flex items-center justify-center mb-2.5 mx-auto"><Icon className="w-5 h-5 text-primary" /></div>
                  <h3 className="font-medium text-foreground text-[13px] text-center mb-0.5 group-hover:text-primary transition-colors line-clamp-1">{category.nameBn}</h3>
                  <p className="text-[11px] text-muted-foreground text-center">{category.count}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-center mt-5 md:mt-8">
          <Link to="/books"><Button variant="outline" className="btn-gold-outline h-10 px-6 text-[13px]">View All Categories</Button></Link>
        </div>
      </div>
    </section>
  )
}
