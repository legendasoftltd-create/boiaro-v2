import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Star, ChevronLeft, ChevronRight, Package, Truck, ShoppingBag, BookOpen } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { trpcBookToMasterBook } from "@/hooks/useBooks"
import { usePlatformStats } from "@/hooks/usePlatformStats"
import { useContentFilter } from "@/contexts/ContentFilterContext"
import { useCart } from "@/contexts/CartContext"
import { toast } from "@/hooks/use-toast"
import { SectionSearch } from "./SectionSearch"
import { HardcopyBookCard } from "./HardcopyBookCard"

export function HardCopies() {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Independent of every other section's search — only narrows Popular Hard Copies.
  const [search, setSearch] = useState("")
  const { data } = trpc.books.browseBooks.useQuery(
    { format: "hardcopy", sort: "popular", pageSize: 10, query: search || undefined },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  )
  const popularHardcopies = (data?.books || []).map(trpcBookToMasterBook)
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
  if (popularHardcopies.length === 0 && !search.trim()) return null

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
          <div className="flex items-center gap-3">
            <div className="hidden lg:block">
              <SectionSearch value={search} onChange={setSearch} placeholder="Search hard copies..." />
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>

        {popularHardcopies.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No hard copies match this search yet.</p>
        ) : (
        <div ref={scrollRef} className="scroll-row stagger-children">
          {popularHardcopies.map((book) => (
            <HardcopyBookCard key={book.id} book={book} isAdded={addedIds.has(book.id)} onAddToCart={handleAddToCart} />
          ))}
        </div>
        )}

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
