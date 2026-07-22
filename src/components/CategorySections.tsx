import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react"
import { BookCard } from "./BookCard"
import { ContentToggle } from "./ContentToggle"
import { SectionSearch } from "./SectionSearch"
import { trpc } from "@/lib/trpc"
import { trpcBookToMasterBook } from "@/hooks/useBooks"
import type { ContentType } from "@/contexts/ContentFilterContext"
import { toServerFormat } from "@/hooks/useBookFilter"

interface CategorySectionProps {
  section: {
    id: string;
    category_id: string;
    title: string | null;
    subtitle: string | null;
    book_limit: number;
    category: { name: string; name_bn: string | null; name_en: string | null };
  };
}

/**
 * Each row is fully self-contained: its own filter, its own search, its own book fetch
 * (scoped to this category via browseBooks' categoryId) — independent of every other
 * category row, the same way every other homepage section is independent of the rest.
 * A shared query across all rows previously meant typing in one row's search box silently
 * filtered every other row too.
 */
function CategorySectionRow({ section }: CategorySectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<ContentType>("all")
  const [search, setSearch] = useState("")

  const { data } = trpc.books.browseBooks.useQuery(
    { categoryId: section.category_id, format: toServerFormat(filter), query: search || undefined, pageSize: section.book_limit, sort: "newest" },
    { staleTime: 3 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  )
  const books = (data?.books || []).map(trpcBookToMasterBook)
  const hasBooks = books.length > 0
  const isFiltering = filter !== "all" || search.trim() !== ""

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" })
  }

  const displayTitle = section.title || section.category.name_bn || section.category.name_en || section.category.name
  const subtitle = section.subtitle

  // Only hide when there's genuinely nothing by default — once the user is actively
  // filtering/searching this row, keep its header (and controls) visible even at zero
  // matches, so there's always a way back to "All"/a cleared search.
  if (!hasBooks && !isFiltering) return null

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 md:gap-4 mb-3 md:mb-8">
          <div className="section-header mb-0">
            <div className="section-icon bg-primary/10">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                {displayTitle}
              </h2>
              {subtitle && (
                <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-1 lg:pb-0">
            <div className="hidden lg:block">
              <ContentToggle value={filter} onChange={setFilter} />
            </div>
            <div className="hidden lg:block">
              <SectionSearch value={search} onChange={setSearch} placeholder="Search category..." />
            </div>
            <Link
              to={`/books?category=${section.category_id}`}
              className="text-xs text-primary hover:underline font-medium shrink-0"
            >
              সব দেখুন →
            </Link>
            {hasBooks && (
              <div className="hidden md:flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {hasBooks ? (
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x"
          >
            {books.map((book) => (
              <div key={book.id} className="snap-start shrink-0">
                <BookCard book={book} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6">No books match this filter yet.</p>
        )}
      </div>
    </section>
  )
}

export function CategorySections() {
  // Unfiltered — each row fetches its own books independently (see CategorySectionRow).
  // This call only supplies the admin-configured list of sections (title/subtitle/category).
  const { data: result } = trpc.books.homepageCategorySections.useQuery({})
  const sections = result?.data ?? []

  if (sections.length === 0) return null

  return (
    <>
      {sections.map((section: any) => (
        <CategorySectionRow key={section.id} section={section} />
      ))}
    </>
  )
}
