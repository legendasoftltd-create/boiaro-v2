import { useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Star, ChevronLeft, ChevronRight, Package, Truck, ShoppingBag, BookOpen, Headphones, Check } from "lucide-react"
import { useBooks } from "@/hooks/useBooks"
import { usePlatformStats } from "@/hooks/usePlatformStats"
import { useContentFilter } from "@/contexts/ContentFilterContext"
import { useCart } from "@/contexts/CartContext"
import { toast } from "@/hooks/use-toast"

export function HardCopies() {
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { hardcopies: popularHardcopies } = useBooks()
  const { stats, formatCount } = usePlatformStats()
  const { globalFilter } = useContentFilter()
  const { addToCart, openCart } = useCart()
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "left" ? -320 : 320, behavior: "smooth" })
    }
  }

  const handleAddToCart = (book: typeof popularHardcopies[0], e: React.MouseEvent) => {
    e.stopPropagation()
    const hardcopy = book.formats.hardcopy!
    addToCart(book, "hardcopy", hardcopy.price ?? 0)
    setAddedIds(prev => new Set(prev).add(book.id))
    toast({ title: "কার্টে যোগ হয়েছে", description: `${book.title} কার্টে যোগ করা হলো` })
    openCart()
    setTimeout(() => setAddedIds(prev => { const n = new Set(prev); n.delete(book.id); return n }), 2000)
  }

  // Hide this section if filter excludes hardcopies
  if (globalFilter !== "all" && globalFilter !== "hardcopy") return null
  if (popularHardcopies.length === 0) return null

  return (
    <section id="hardcopy" className="section-container bg-gradient-to-b from-emerald-500/[0.03] via-background to-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-emerald-500/10"><Package className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Popular <span className="text-emerald-500">Hard Copies</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />Free delivery on orders above ৳500</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        <div ref={scrollRef} className="scroll-row stagger-children">
          {popularHardcopies.map((book) => {
            const hardcopy = book.formats.hardcopy!
            const hasEbook = book.formats.ebook?.available
            const hasAudio = book.formats.audiobook?.available
            return (
               <div key={book.id} className="flex-shrink-0 w-[140px] md:w-[200px] snap-start group cursor-pointer" onClick={() => navigate(`/book/${book.slug}`)}>
                 <div className="relative aspect-[2/3] rounded-xl md:rounded-2xl overflow-hidden mb-2 md:mb-3 bg-card shadow-md ring-1 ring-emerald-500/15 group-hover:ring-emerald-500/40 group-hover:shadow-xl group-hover:shadow-emerald-500/[0.06] transition-all duration-300">
                  <img src={book.cover} alt={book.titleEn} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                  <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
                    {hardcopy.discount && <Badge className="bg-red-600 text-foreground text-[10px] font-bold shadow-sm">{hardcopy.discount}% OFF</Badge>}
                  </div>
                  {book.isBestseller && <Badge className="absolute top-8 left-2 bg-primary text-primary-foreground text-[10px] shadow-sm">Bestseller</Badge>}
                  {(hasEbook || hasAudio) && (
                    <div className="absolute bottom-14 left-2 flex items-center gap-1">
                      {hasEbook && <Badge variant="outline" className="bg-background/70 backdrop-blur-sm border-primary/30 text-primary text-[9px] px-1.5"><BookOpen className="w-2.5 h-2.5 mr-0.5" />eBook</Badge>}
                      {hasAudio && <Badge variant="outline" className="bg-background/70 backdrop-blur-sm border-blue-500/30 text-blue-400 text-[9px] px-1.5"><Headphones className="w-2.5 h-2.5 mr-0.5" />Audio</Badge>}
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-base font-bold text-emerald-400">৳{hardcopy.price}</span>
                      {hardcopy.originalPrice && <span className="text-[11px] text-muted-foreground line-through">৳{hardcopy.originalPrice}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{hardcopy.pages} pages</p>
                  </div>
                </div>
                <div className="space-y-0.5 px-0.5">
                  <h3 className="font-medium text-foreground line-clamp-1 text-[13px] group-hover:text-emerald-400 transition-colors">{book.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{book.author.name}</p>
                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1"><Star className="w-3 h-3 fill-primary text-primary" /><span className="text-xs text-foreground font-medium">{book.rating}</span></div>
                    <Button size="sm" className={`h-6 px-2.5 text-foreground text-[11px] gap-1 rounded-lg ${addedIds.has(book.id) ? "bg-green-600 hover:bg-green-700" : "bg-emerald-600 hover:bg-emerald-700"}`} onClick={(e) => handleAddToCart(book, e)}>
                      {addedIds.has(book.id) ? <><Check className="w-3 h-3" />Added</> : <><ShoppingBag className="w-3 h-3" />Add</>}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 mt-6 md:mt-10 pt-4 md:pt-6 border-t border-border/40">
          {[
            { icon: Truck, color: "text-emerald-500", bg: "bg-emerald-500/10", title: "Free Delivery", sub: "৳500+ orders" },
            { icon: Package, color: "text-emerald-500", bg: "bg-emerald-500/10", title: "Quality Print", sub: "Premium paper" },
            { icon: BookOpen, color: "text-primary", bg: "bg-primary/10", title: "Free eBook", sub: "With select titles" },
            { icon: Star, color: "text-blue-500", bg: "bg-blue-500/10", title: `${formatCount(stats.hardcopies)} Titles`, sub: "Growing daily" },
          ].map(({ icon: Icon, color, bg, title, sub }) => (
            <div key={title} className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}><Icon className={`w-4 h-4 ${color}`} /></div>
              <div><p className="text-[13px] font-medium text-foreground">{title}</p><p className="text-[11px] text-muted-foreground">{sub}</p></div>
            </div>
          ))}
        </div>
         <div className="text-center mt-4 md:mt-8">
           <Link to="/books?format=hardcopy"><Button className="bg-emerald-600 hover:bg-emerald-700 text-foreground h-9 md:h-10 px-5 md:px-6 rounded-xl font-semibold text-[12px] md:text-[13px] transition-all duration-200"><ShoppingBag className="w-4 h-4 mr-1.5" />Browse All Hard Copies</Button></Link>
        </div>
      </div>
    </section>
  )
}
