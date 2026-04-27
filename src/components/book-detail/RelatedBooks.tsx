import { Link } from "react-router-dom"
import { Star, BookOpen, Sparkles, Loader2 } from "lucide-react"
import { trpc } from "@/lib/trpc"
import type { MasterBook } from "@/lib/types"
import { BookCard } from "@/components/BookCard"
import { toMediaUrl } from "@/lib/mediaUrl"

interface Props {
  book: MasterBook
  allBooks: MasterBook[]
}

export function RelatedBooks({ book, allBooks }: Props) {
  const { data: recData, isLoading: aiLoading } = trpc.books.recommendations.useQuery(
    { bookId: book.id },
    { staleTime: 5 * 60 * 1000 }
  )
  const aiSimilar = (recData as any[] | undefined) ?? []

  const localRelated = allBooks.filter(
    (b) => b.id !== book.id && (b.author.id === book.author.id || b.category.id === book.category.id)
  ).slice(0, 6)

  const hasLocalData = localRelated.length > 0
  const hasAiData = aiSimilar.length > 0

  if (!hasLocalData && !hasAiData && !aiLoading) return null

  const renderAiCard = (b: any) => (
    <Link key={b.id} to={`/book/${b.slug}`} className="shrink-0 w-[130px] md:w-[160px] group cursor-pointer block">
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-muted mb-2 ring-1 ring-border/50 group-hover:ring-primary/30 transition-all">
        {b.cover || b.cover_url ? (
          <img src={b.cover || toMediaUrl(b.cover_url)} alt={b.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><BookOpen className="w-8 h-8 text-muted-foreground" /></div>
        )}
      </div>
      <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">{b.title}</p>
      {(b.author?.name || b.authors?.name) && <p className="text-xs text-muted-foreground">{b.author?.name || b.authors?.name}</p>}
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
              {aiSimilar.map(renderAiCard)}
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
