import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Star, BookOpen, Sparkles, Loader2 } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import type { MasterBook } from "@/lib/types"
import { BookCard } from "@/components/BookCard"

interface Props {
  book: MasterBook
  allBooks: MasterBook[]
}

interface DbBook {
  id: string
  title: string
  slug: string
  cover_url: string | null
  rating: number | null
  authors: { name: string } | null
}

export function RelatedBooks({ book, allBooks }: Props) {
  const [dbRelated, setDbRelated] = useState<DbBook[]>([])
  const [aiSimilar, setAiSimilar] = useState<DbBook[]>([])
  const [aiLoading, setAiLoading] = useState(true)

  // Fetch related from DB by same author or category
  useEffect(() => {
    const fetchRelated = async () => {
      const queries = []
      if (book.author?.id) {
        queries.push(
          supabase
            .from("books")
            .select("id, title, slug, cover_url, rating, authors(name)")
            .eq("author_id", book.author.id)
            .eq("submission_status", "approved")
            .neq("id", book.id)
            .limit(6)
        )
      }
      if (book.category?.id) {
        queries.push(
          supabase
            .from("books")
            .select("id, title, slug, cover_url, rating, authors(name)")
            .eq("category_id", book.category.id)
            .eq("submission_status", "approved")
            .neq("id", book.id)
            .limit(6)
        )
      }

      const results = await Promise.all(queries)
      const all = results.flatMap((r) => r.data || [])
      const seen = new Set<string>()
      const unique = all.filter((b) => { if (seen.has(b.id)) return false; seen.add(b.id); return true })
      setDbRelated(unique.slice(0, 8) as DbBook[])
    }
    fetchRelated()
  }, [book.id, book.author?.id, book.category?.id])

  // AI-powered similar books
  useEffect(() => {
    const fetchAiSimilar = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ai-recommend", {
          body: { type: "similar", bookId: book.id },
        })
        if (!error && data?.recommendations?.length > 0) {
          setAiSimilar(data.recommendations.slice(0, 8) as DbBook[])
        }
      } catch {
        // Silent fail — DB fallback already available
      }
      setAiLoading(false)
    }
    fetchAiSimilar()
  }, [book.id])

  const localRelated = allBooks.filter(
    (b) => b.id !== book.id && (b.author.id === book.author.id || b.category.id === book.category.id)
  ).slice(0, 6)

  const hasDbData = dbRelated.length > 0
  const hasLocalData = localRelated.length > 0
  const hasAiData = aiSimilar.length > 0

  if (!hasDbData && !hasLocalData && !hasAiData && !aiLoading) return null

  const renderDbBookCard = (b: DbBook) => (
    <Link key={b.id} to={`/book/${b.slug}`} className="shrink-0 w-[130px] md:w-[160px] group cursor-pointer block">
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-muted mb-2 ring-1 ring-border/50 group-hover:ring-primary/30 transition-all">
        {b.cover_url ? (
          <img src={b.cover_url} alt={b.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><BookOpen className="w-8 h-8 text-muted-foreground" /></div>
        )}
      </div>
      <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">{b.title}</p>
      {(b.authors as any)?.name && <p className="text-xs text-muted-foreground">{(b.authors as any).name}</p>}
      {b.rating != null && b.rating > 0 && (
        <div className="flex items-center gap-1 mt-1">
          <Star className="w-3 h-3 fill-primary text-primary" />
          <span className="text-xs text-muted-foreground">{b.rating}</span>
        </div>
      )}
    </Link>
  )

  return (
    <div className="space-y-6">
      {/* AI Similar Books */}
      {(hasAiData || aiLoading) && (
        <section className="container mx-auto px-4 lg:px-8 py-4 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-serif font-bold text-foreground">You May Also Like</h2>
          </div>
          {aiLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
              {aiSimilar.map(renderDbBookCard)}
            </div>
          )}
        </section>
      )}

      {/* Same Author */}
      {hasLocalData && localRelated.filter(b => b.author.id === book.author.id).length > 0 && (
        <section className="container mx-auto px-4 lg:px-8 py-4 border-t border-border">
          <h2 className="text-xl font-serif font-bold text-foreground mb-4">More by {book.author.name}</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {localRelated.filter((b) => b.author.id === book.author.id).map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        </section>
      )}

      {/* Related by category / DB */}
      {hasDbData && !hasAiData && (
        <section className="container mx-auto px-4 lg:px-8 py-4 border-t border-border">
          <h2 className="text-xl font-serif font-bold text-foreground mb-4">Readers Also Enjoyed</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {dbRelated.map(renderDbBookCard)}
          </div>
        </section>
      )}

      {/* Category-based local */}
      {localRelated.filter((b) => b.author.id !== book.author.id).length > 0 && !hasAiData && (
        <section className="container mx-auto px-4 lg:px-8 py-4 border-t border-border">
          <h2 className="text-xl font-serif font-bold text-foreground mb-4">Similar Books</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {localRelated.filter((b) => b.author.id !== book.author.id).map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
