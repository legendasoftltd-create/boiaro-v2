import { useMemo, useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useSiteSettings } from "@/hooks/useSiteSettings"
// SEO meta tags set via document.title
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { BookCard } from "@/components/BookCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useBrowseBooks, useCategories } from "@/hooks/useBooks"
import { ContentFilterProvider } from "@/contexts/ContentFilterContext"
import { Search, BookOpen, Headphones, Package, Flame, Gift, Sparkles, X, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react"

/*──────────────────────────────────────────────
  URL schema:
    /books?format=ebook&filter=trending&category=<id>&q=hello

  - format:   ebook | audiobook | hardcopy           (omit = all formats)
  - filter:   trending | free | new | bestseller     (omit = none)
  - category: category UUID                          (omit = all categories)
  - q:        search string                          (omit = no search)
  - sort:     popular | newest | rating              (omit = default)

  All params are optional and composable.
──────────────────────────────────────────────*/

type FormatKey = "ebook" | "audiobook" | "hardcopy"
type FilterKey = "trending" | "free" | "new" | "bestseller"
type SortKey = "popular" | "newest" | "rating"

const FORMAT_TABS: { key: FormatKey | "all"; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All Formats", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { key: "ebook", label: "eBooks", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { key: "audiobook", label: "Audiobooks", icon: <Headphones className="w-3.5 h-3.5" /> },
  { key: "hardcopy", label: "Hard Copies", icon: <Package className="w-3.5 h-3.5" /> },
]

const FILTER_CHIPS: { key: FilterKey; label: string; icon: React.ReactNode }[] = [
  { key: "trending", label: "Trending", icon: <Flame className="w-3 h-3" /> },
  { key: "new", label: "New Releases", icon: <Sparkles className="w-3 h-3" /> },
  { key: "free", label: "Free", icon: <Gift className="w-3 h-3" /> },
]

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Most Popular" },
  { key: "newest", label: "Newest First" },
  { key: "rating", label: "Highest Rated" },
]

// Filters are now applied server-side via useBrowseBooks

/** Build a human-readable page title from active filters */
function buildTitle(format: string | null, filter: string | null, categoryName: string | null): string {
  const parts: string[] = []
  if (filter) parts.push(filter.charAt(0).toUpperCase() + filter.slice(1))
  if (format) {
    const labels: Record<string, string> = { ebook: "eBooks", audiobook: "Audiobooks", hardcopy: "Hard Copies" }
    parts.push(labels[format] || format)
  }
  if (categoryName) parts.push(categoryName)
  if (parts.length === 0) return "Browse Books"
  return parts.join(" ") + " — Books"
}

export default function BooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { get } = useSiteSettings()

  // Read all params from URL (single source of truth)
  const format = (searchParams.get("format") as FormatKey | null) || null
  const filter = (searchParams.get("filter") as FilterKey | null) || null
  const categoryId = searchParams.get("category") || null
  const query = searchParams.get("q") || ""
  const sort = (searchParams.get("sort") as SortKey | null) || null
  const [searchDraft, setSearchDraft] = useState(query)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Legacy: support old ?filter=ebook URLs by mapping to format
  const effectiveFormat = format || (["ebook", "audiobook", "hardcopy"].includes(filter as string) ? filter as FormatKey : null)
  const effectiveFilter = ["ebook", "audiobook", "hardcopy"].includes(filter as string) ? null : filter

  const browseFilters = useMemo(() => ({
    format: effectiveFormat,
    filter: effectiveFilter,
    categoryId,
    query: query || null,
    sort,
  }), [effectiveFormat, effectiveFilter, categoryId, query, sort])

  const { books: filtered, loading, total, page, totalPages, hasMore, setPage, nextPage, prevPage } = useBrowseBooks(browseFilters)
  const categories = useCategories()
  const selectedCategory = categories.find(c => c.id === categoryId)


  // Update URL helper — preserves all params, only changes specified ones
  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key)
      else params.set(key, value)
    }
    // Clean up legacy 'filter' if we set 'format'
    if (updates.format !== undefined && params.has("filter") && ["ebook", "audiobook", "hardcopy"].includes(params.get("filter")!)) {
      params.delete("filter")
    }
    setSearchParams(params, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    setSearchDraft(query);
  }, [query]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const nextValue = searchDraft.trim();
      if (nextValue === query) return;
      updateParams({ q: nextValue || null });
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchDraft, query, updateParams]);


  const pageTitle = buildTitle(effectiveFormat, effectiveFilter, selectedCategory?.nameBn || selectedCategory?.name || null)
  // Set document title for SEO
  const docTitle = `${pageTitle} | ${get("brand_name", "BoiAro")}`
  useEffect(() => {
    if (typeof document !== "undefined") document.title = docTitle;
  }, [docTitle]);

  return (
    <ContentFilterProvider>
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-20 pb-12">
          <div className="container mx-auto px-4 lg:px-8">
            {/* Header */}
            <div className="mb-6 md:mb-8">
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-2">
                {pageTitle.includes("—") ? (
                  <>{pageTitle.split("—")[0].trim()} <span className="text-primary">Books</span></>
                ) : (
                  <>Browse <span className="text-primary">Books</span></>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">Discover your next favorite read from our collection</p>
            </div>

            {/* Search — synced to URL */}
            <div className="relative mb-4 md:mb-6 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, author..."
                value={searchDraft}
                onChange={e => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                    const nextValue = searchDraft.trim();
                    updateParams({ q: nextValue || null });
                  }
                }}
                className="pl-9 h-10 bg-card border-border/60"
              />
            </div>

            {/* Format tabs */}
            <div className="flex gap-0 rounded-xl border border-border/60 bg-card/80 p-1 mb-3 md:mb-5 overflow-x-auto">
              {FORMAT_TABS.map(tab => {
                const isActive = (tab.key === "all" && !effectiveFormat) || tab.key === effectiveFormat
                const colorMap: Record<string, string> = {
                  all: "bg-primary text-primary-foreground shadow-md",
                  ebook: "bg-amber-500 text-black shadow-md shadow-amber-500/20",
                  audiobook: "bg-blue-500 text-white shadow-md shadow-blue-500/20",
                  hardcopy: "bg-emerald-500 text-white shadow-md shadow-emerald-500/20",
                }
                return (
                  <button
                    key={tab.key}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      isActive ? colorMap[tab.key] : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                    onClick={() => updateParams({ format: tab.key === "all" ? null : tab.key })}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Filter chips (composable with format) */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4 md:mb-6">
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground mr-1" />
              {FILTER_CHIPS.map(chip => {
                const isActive = effectiveFilter === chip.key
                return (
                  <Button
                    key={chip.key}
                    size="sm"
                    variant={isActive ? "secondary" : "ghost"}
                    className={`h-7 text-[11px] gap-1 rounded-full ${isActive ? "bg-secondary text-foreground ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => updateParams({ filter: isActive ? null : chip.key })}
                  >
                    {chip.icon} {chip.label}
                  </Button>
                )
              })}
              <span className="w-px h-4 bg-border/50 mx-1" />
              {SORT_OPTIONS.map(opt => {
                const isActive = sort === opt.key
                return (
                  <Button
                    key={opt.key}
                    size="sm"
                    variant={isActive ? "secondary" : "ghost"}
                    className={`h-7 text-[11px] rounded-full ${isActive ? "bg-secondary text-foreground ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => updateParams({ sort: isActive ? null : opt.key })}
                  >
                    {opt.label}
                  </Button>
                )
              })}
            </div>

            {/* Active filters summary */}
            {(effectiveFormat || effectiveFilter || categoryId || query) && (
              <div className="flex flex-wrap items-center gap-1.5 mb-4">
                <span className="text-xs text-muted-foreground">Active:</span>
                {effectiveFormat && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {FORMAT_TABS.find(t => t.key === effectiveFormat)?.label}
                    <button onClick={() => updateParams({ format: null })}><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {effectiveFilter && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {FILTER_CHIPS.find(c => c.key === effectiveFilter)?.label}
                    <button onClick={() => updateParams({ filter: null })}><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {categoryId && selectedCategory && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {selectedCategory.nameBn || selectedCategory.name}
                    <button onClick={() => updateParams({ category: null })}><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {query && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    "{query}"
                    <button onClick={() => updateParams({ q: null })}><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchParams({}, { replace: true })}
                >
                  Clear all
                </Button>
              </div>
            )}

            {/* Category pills */}
            {!categoryId && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {categories.slice(0, 12).map(cat => (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] rounded-full bg-card/40"
                    onClick={() => updateParams({ category: cat.id })}
                  >
                    {cat.nameBn || cat.name}
                  </Button>
                ))}
              </div>
            )}

            {/* Results */}
            {loading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] rounded-xl bg-card animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">No books found</h3>
                <p className="text-sm text-muted-foreground mb-4">Try a different filter or search term</p>
                <Button variant="outline" onClick={() => setSearchParams({}, { replace: true })}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  {total} book{total !== 1 ? "s" : ""} found
                  {totalPages > 1 && <span className="ml-1">· Page {page + 1} of {totalPages}</span>}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 md:gap-5">
                  {filtered.map(book => (
                    <BookCard key={book.id} book={book} fillWidth />
                  ))}
                </div>
                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={prevPage}
                      disabled={page === 0}
                      className="gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" /> পূর্ববর্তী
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i;
                        } else if (page < 3) {
                          pageNum = i;
                        } else if (page > totalPages - 4) {
                          pageNum = totalPages - 5 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            size="sm"
                            variant={pageNum === page ? "default" : "outline"}
                            className="w-9 h-9"
                            onClick={() => setPage(pageNum)}
                          >
                            {pageNum + 1}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={nextPage}
                      disabled={!hasMore}
                      className="gap-1"
                    >
                      পরবর্তী <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <Footer />
      </main>
    </ContentFilterProvider>
  )
}
