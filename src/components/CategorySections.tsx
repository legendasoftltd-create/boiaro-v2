import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react"
import { BookCard } from "./BookCard"
import { ContentToggle } from "./ContentToggle"
import { SectionSearch } from "./SectionSearch"
import { trpc } from "@/lib/trpc"
import { toMediaUrl } from "@/lib/mediaUrl"
import type { ContentType } from "@/contexts/ContentFilterContext"
import { toServerFormat } from "@/hooks/useBookFilter"

interface CategorySectionProps {
  section: {
    id: string;
    category_id: string;
    title: string | null;
    subtitle: string | null;
    book_limit: number;
    sort_order: number;
    category: { id: string; name: string; name_bn: string | null; name_en: string | null; slug: string | null };
    books: any[];
  };
  /** Only the first row shows the toggle/search — they drive the one filter/search shared
   *  by every category row (they're all one query), independent of every other section. */
  showToggle?: boolean;
  filter: ContentType;
  setFilter: (value: ContentType) => void;
  search: string;
  setSearch: (value: string) => void;
}

function CategorySectionRow({ section, showToggle, filter, setFilter, search, setSearch }: CategorySectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" })
  }

  const displayTitle = section.title || section.category.name_bn || section.category.name_en || section.category.name
  const subtitle = section.subtitle
  const hasBooks = section.books && section.books.length > 0

  // Rows without the toggle still hide themselves when empty (unchanged behavior). The row
  // that owns the toggle must stay visible even with zero matches for the current filter —
  // otherwise picking a format with no results in this category hides the only control that
  // could switch back to "All", trapping the user.
  if (!hasBooks && !showToggle) return null

  const mappedBooks = (section.books || []).map((b: any) => ({
    id: b.id,
    title: b.title,
    titleEn: b.title_en || "",
    slug: b.slug,
    cover: toMediaUrl(b.cover_url) || "",
    author: b.author ? { id: b.author.id, name: b.author.name, avatar: "", bio: "" } : { id: "", name: "", avatar: "", bio: "" },
    translator: b.translator ? { id: b.translator.id, name: b.translator.name, avatar: "", bio: "" } : { id: "", name: "", avatar: "", bio: "" },
    publisher: { id: "", name: "", logo: "" },
    category: { id: section.category.id, name: section.category.name_bn || section.category.name_en || section.category.name, icon: "BookOpen", color: "" },
    description: "",
    descriptionBn: "",
    rating: 0,
    reviewsCount: 0,
    totalReads: "0",
    publishedDate: "",
    language: "bn",
    tags: [],
    isFeatured: false,
    isNew: false,
    isBestseller: false,
    isFree: false,
    formats: b.formats?.reduce((acc: any, f: any) => {
      if (f.format === "ebook") acc.ebook = { price: f.price };
      if (f.format === "audiobook") acc.audiobook = { price: f.price };
      if (f.format === "hardcopy") acc.hardcopy = { price: f.price };
      return acc;
    }, {}),
  }))

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4 mb-3 md:mb-8">
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
          <div className="flex items-center gap-3">
            {showToggle && (
              <div className="hidden lg:block">
                <ContentToggle value={filter} onChange={setFilter} />
              </div>
            )}
            {showToggle && (
              <div className="hidden lg:block">
                <SectionSearch value={search} onChange={setSearch} placeholder="Search category..." />
              </div>
            )}
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
            {mappedBooks.map((book: any) => (
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
  // Independent of every other section's filter/search — both only control Category Sections.
  const [filter, setFilter] = useState<ContentType>("all")
  const [search, setSearch] = useState("")
  const { data: result } = trpc.books.homepageCategorySections.useQuery({ format: toServerFormat(filter), search: search || undefined })
  const sections = result?.data ?? []

  if (sections.length === 0) return null

  return (
    <>
      {sections.map((section: any, index: number) => (
        <CategorySectionRow
          key={section.id}
          section={section}
          showToggle={index === 0}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
        />
      ))}
    </>
  )
}
