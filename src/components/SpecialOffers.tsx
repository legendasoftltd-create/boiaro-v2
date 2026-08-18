import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Tag } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { trpcBookToMasterBook } from "@/hooks/useBooks"
import { useContentFilter } from "@/contexts/ContentFilterContext"
import { useCart } from "@/contexts/CartContext"
import { toast } from "@/hooks/use-toast"
import { SectionSearch } from "./SectionSearch"
import { HardcopyBookCard } from "./HardcopyBookCard"

// Hard copies currently carrying an admin-set discount (BookFormat.discount),
// ranked highest-discount first — see server/src/services/books.service.ts.
export function SpecialOffers() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState("")
  const { globalFilter } = useContentFilter()
  const { addToCart, openCart } = useCart()
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const { data } = trpc.books.specialOffers.useQuery(
    { limit: 10, search: search || undefined },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  )
  const books = (data || []).map(trpcBookToMasterBook)

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" })

  const handleAddToCart = (book: typeof books[0], e: React.MouseEvent) => {
    e.stopPropagation()
    const hardcopy = book.formats.hardcopy!
    addToCart(book, "hardcopy", hardcopy.price ?? 0)
    setAddedIds((prev) => new Set(prev).add(book.id))
    toast({ title: "কার্টে যোগ হয়েছে", description: `${book.title} কার্টে যোগ করা হলো` })
    openCart()
    setTimeout(() => setAddedIds((prev) => { const n = new Set(prev); n.delete(book.id); return n }), 2000)
  }

  if (globalFilter !== "all" && globalFilter !== "hardcopy") return null
  if (books.length === 0 && !search.trim()) return null

  return (
    <section className="section-container bg-gradient-to-b from-red-500/[0.03] via-background to-background">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-red-500/10"><Tag className="w-5 h-5 text-red-500" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Special <span className="text-red-500">Offers</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">সীমিত সময়ের জন্য ছাড়ে পাওয়া বই</p>
            </div>
          </div>
          <div className="hidden lg:block">
            <SectionSearch value={search} onChange={setSearch} placeholder="Search offers..." />
          </div>
          <div className="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        {books.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No special offers match this search yet.</p>
        ) : (
          <div ref={scrollRef} className="scroll-row stagger-children">
            {books.map((book) => (
              <HardcopyBookCard key={book.id} book={book} isAdded={addedIds.has(book.id)} onAddToCart={handleAddToCart} />
            ))}
          </div>
        )}
        <div className="text-center mt-5 md:mt-8">
          <Link to="/books?format=hardcopy"><Button variant="outline" className="border-red-500/40 text-red-500 hover:bg-red-500 hover:text-foreground h-10 px-6 rounded-xl font-semibold text-[13px] transition-all duration-200">সব দেখুন →</Button></Link>
        </div>
      </div>
    </section>
  )
}
