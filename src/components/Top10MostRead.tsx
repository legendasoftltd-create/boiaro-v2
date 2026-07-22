import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Trophy, Star, BookOpen, Eye } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { trpcBookToMasterBook } from "@/hooks/useBooks"
import { useContentFilter } from "@/contexts/ContentFilterContext"
import { toServerFormat } from "@/hooks/useBookFilter"
import { SectionSearch } from "./SectionSearch"
import { Button } from "@/components/ui/button"

export function Top10MostRead() {
  const navigate = useNavigate()
  const { globalFilter } = useContentFilter()
  // Independent of every other section's search — only narrows Top 10 Most Read.
  const [search, setSearch] = useState("")

  // Queried directly sorted by total_reads across the whole catalog — the
  // generic homepage book list is capped at 100 most-recently-created books,
  // which silently excluded older high-read books from this "all-time" ranking.
  // sort: "mostRead" (not "popular") deliberately skips the admin priority
  // override — this section's whole point is genuine reader behavior.
  const { data } = trpc.books.browseBooks.useQuery(
    { pageSize: 30, sort: "mostRead", format: toServerFormat(globalFilter), query: search || undefined },
    { staleTime: 5 * 60 * 1000 }
  )
  const books = (data?.books || []).map(trpcBookToMasterBook)

  const top10 = books.slice(0, 10)

  // Below-3 normally hides the section (a 1-2 book "top 10" isn't meaningful) — but once
  // the user is actively searching, keep the header (and search box) visible instead of
  // vanishing with no way back to a cleared search.
  if (top10.length < 3 && !search.trim()) return null

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="section-header flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <div className="section-icon bg-amber-500/10">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                Top 10 <span className="text-amber-400">Most Read</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">All-time reader favorites</p>
            </div>
          </div>
          <div className="hidden lg:block">
            <SectionSearch value={search} onChange={setSearch} placeholder="Search most read..." />
          </div>
        </div>

        {top10.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No books match this search yet.</p>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
          {top10.map((book, index) => {
            const rank = index + 1
            const isTop3 = rank <= 3
            const rankColors = ["text-amber-400", "text-gray-300", "text-amber-600"]

            return (
              <div
                key={book.id}
                onClick={() => navigate(`/book/${book.slug}`)}
                className={`group flex items-center gap-3 md:gap-4 p-2.5 md:p-3 rounded-xl md:rounded-2xl cursor-pointer transition-all duration-300 ${
                  isTop3
                    ? "bg-gradient-to-r from-amber-500/[0.06] via-card to-card border border-amber-500/20 hover:border-amber-500/40"
                    : "bg-card/50 border border-border/40 hover:border-primary/20"
                } hover:shadow-lg hover:shadow-primary/[0.03]`}
              >
                {/* Rank number */}
                <div className="flex-shrink-0 w-10 text-center">
                  <span className={`text-2xl md:text-3xl font-serif font-black ${isTop3 ? rankColors[rank - 1] : "text-muted-foreground/40"}`}>
                    {rank}
                  </span>
                </div>

                {/* Cover */}
                <div className="flex-shrink-0 w-14 h-20 rounded-xl overflow-hidden ring-1 ring-border/50 group-hover:ring-primary/30 transition-all">
                  <img src={book.cover} alt={book.title} className="w-full h-full object-cover" loading="lazy" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground text-sm line-clamp-1 group-hover:text-primary transition-colors">
                    {book.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{book.author.name}</p>
                  {book.translator?.name && <p className="text-xs text-muted-foreground line-clamp-1">Tr: {book.translator.name}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    {book.rating > 0 && (
                      <span className="flex items-center gap-1 text-xs">
                        <Star className="w-3 h-3 fill-primary text-primary" />
                        <span className="text-foreground font-medium">{book.rating}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" /> {book.totalReads}
                    </span>
                  </div>
                </div>

                {/* Format indicator */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  {book.formats.ebook?.available && (
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-3 h-3 text-primary" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        )}
        <div className="text-center mt-5 md:mt-8">
          <Link to="/books?sort=mostRead"><Button variant="outline" className="border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-foreground h-10 px-6 rounded-xl font-semibold text-[13px] transition-all duration-200">সব দেখুন →</Button></Link>
        </div>
      </div>
    </section>
  )
}
