import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react"
import { BookCard } from "./BookCard"
import { ContentToggle } from "./ContentToggle"
import { SectionSearch } from "./SectionSearch"
import { trpc } from "@/lib/trpc"
import { trpcBookToMasterBook } from "@/hooks/useBooks"
import { toServerFormat } from "@/hooks/useBookFilter"
import type { ContentType } from "@/contexts/ContentFilterContext"

// Ranked by real sales across every format (OrderItem quantity, last 180
// days of non-cancelled orders — see server/src/services/books.service.ts's
// getBestSellerBookIds), not the manually-admin-set "Bestseller" badge shown
// on individual cards. Independent of the page's global content filter —
// this section has its own All/eBooks/Audio/Print toggle.
export function BestSellers() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [localFilter, setLocalFilter] = useState<ContentType>("all")
  const [search, setSearch] = useState("")

  const { data } = trpc.books.bestSellers.useQuery(
    { limit: 10, search: search || undefined, format: toServerFormat(localFilter) },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  )
  const books = (data || []).map(trpcBookToMasterBook)
  const isFiltering = localFilter !== "all" || search.trim() !== ""

  const scroll = (d: "left" | "right") =>
    scrollRef.current?.scrollBy({ left: d === "left" ? -320 : 320, behavior: "smooth" })

  if (books.length === 0 && !isFiltering) return null

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-amber-500/10"><Trophy className="w-5 h-5 text-amber-500" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">Best <span className="text-amber-500">Sellers</span></h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">সবচেয়ে বেশি বিক্রি হওয়া বই</p>
            </div>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
            <div className="hidden lg:block">
              <ContentToggle value={localFilter} onChange={setLocalFilter} />
            </div>
            <div className="hidden lg:block">
              <SectionSearch value={search} onChange={setSearch} placeholder="Search best sellers..." />
            </div>
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
        {books.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No best sellers match this filter yet.</p>
        ) : (
          <div ref={scrollRef} className="scroll-row stagger-children">
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
        <div className="text-center mt-5 md:mt-8">
          {/* /books?filter=bestseller reads the manual is_bestseller admin flag, a
              different (curated) list from this section's real-sales ranking —
              linking there would show a list that disagrees with what was just
              browsed, so this goes to the plain, unfiltered catalog instead. */}
          <Link to="/books"><Button variant="outline" className="border-amber-500/40 text-amber-500 hover:bg-amber-500 hover:text-foreground h-10 px-6 rounded-xl font-semibold text-[13px] transition-all duration-200">সব দেখুন →</Button></Link>
        </div>
      </div>
    </section>
  )
}
