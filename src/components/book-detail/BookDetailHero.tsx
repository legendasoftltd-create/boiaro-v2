import { Link } from "react-router-dom"
import { Star, BookOpen, Headphones, Package, BookmarkCheck, Share2, Eye, Heart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { FollowButton } from "@/components/FollowButton"
import type { MasterBook } from "@/lib/types"
import { stripHtml } from "@/lib/stripHtml"

interface Props {
  book: MasterBook
  liveRating?: number | null
  liveReviewsCount?: number | null
  liveReads?: number | null
}

export function BookDetailHero({ book, liveRating, liveReviewsCount, liveReads }: Props) {
  const { user } = useAuth()

  const hasEbook = book.formats.ebook?.available
  const hasAudiobook = book.formats.audiobook?.available
  const hasHardcopy = book.formats.hardcopy?.available

  const utils = trpc.useUtils()
  const { data: bookmarkData } = trpc.books.isBookmarked.useQuery(
    { bookId: book.id },
    { enabled: !!user }
  )
  const bookmarked = bookmarkData?.bookmarked ?? false

  const bookmarkMutation = trpc.books.bookmark.useMutation({
    onSuccess: (data) => {
      utils.books.isBookmarked.invalidate({ bookId: book.id })
      toast.success(data.bookmarked ? "Added to wishlist ❤️" : "Removed from wishlist")
    },
  })

  const toggleBookmark = () => {
    if (!user) { toast.error("Please sign in"); return }
    bookmarkMutation.mutate({ bookId: book.id })
  }

  const share = () => {
    const shortUrl = `${window.location.origin}/b/${book.id}`
    if (navigator.share) {
      navigator.share({ title: book.title, url: shortUrl })
    } else {
      navigator.clipboard.writeText(shortUrl)
      toast.success("Link copied!")
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src={book.cover} alt="" className="w-full h-full object-cover scale-110 blur-3xl opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/90 to-background" />
      </div>

      <div className="relative z-10 container mx-auto px-4 lg:px-8 py-8 lg:py-16">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
          <div className="flex-shrink-0 mx-auto lg:mx-0">
            <div className="relative w-[220px] md:w-[280px] aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-primary/10 ring-1 ring-border/50">
              <img src={book.cover} alt={book.titleEn} className="w-full h-full object-cover" />
              {book.isFree && (
                <Badge className="absolute top-3 left-3 bg-green-600 text-foreground text-xs font-bold">FREE</Badge>
              )}
              {book.isBestseller && !book.isFree && (
                <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-bold">Bestseller</Badge>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center text-center lg:text-left">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-4">
              {hasEbook && (
                <Badge variant="outline" className="border-primary/40 text-primary gap-1">
                  <BookOpen className="w-3 h-3" /> eBook
                </Badge>
              )}
              {hasAudiobook && (
                <Badge variant="outline" className="border-blue-500/40 text-blue-400 gap-1">
                  <Headphones className="w-3 h-3" /> Audiobook
                </Badge>
              )}
              {hasHardcopy && (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 gap-1">
                  <Package className="w-3 h-3" /> Hard Copy
                </Badge>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-foreground mb-2">
              {book.title}
            </h1>
            <p className="text-lg text-muted-foreground font-medium mb-1">{book.titleEn}</p>

            <div className="flex items-center justify-center lg:justify-start gap-4 mt-4 mb-6">
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const displayRating = liveRating ?? book.rating
                    return (
                      <Star key={i} className={`w-4 h-4 ${i < Math.floor(displayRating) ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
                    )
                  })}
                </div>
                <span className="text-sm font-semibold text-foreground">{(liveRating ?? book.rating).toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">({(liveReviewsCount ?? book.reviewsCount).toLocaleString()} reviews)</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Eye className="w-4 h-4" />
                <span className="text-sm">{liveReads ?? book.totalReads} reads</span>
              </div>
            </div>

            {book.author.id && book.author.name && book.author.name !== "Unknown" && (
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-6">
                <Link to={`/author/${book.author.id}`} className="flex items-center gap-3 group/author cursor-pointer">
                  {book.author.avatar && (
                    <img src={book.author.avatar} alt={book.author.nameEn} className="w-10 h-10 rounded-full object-cover ring-2 ring-border group-hover/author:ring-primary transition-colors" />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground group-hover/author:text-primary transition-colors">{book.author.name}</p>
                    {book.author.genre && <p className="text-xs text-muted-foreground">{book.author.genre}</p>}
                  </div>
                </Link>
                <FollowButton profileId={book.author.id} profileType="author" showCount />
              </div>
            )}

            {book.publisher.id && book.publisher.name && (
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-3">
                <Link to={`/publisher/${book.publisher.id}`} className="flex items-center gap-3 group/pub cursor-pointer">
                  {book.publisher.logo ? (
                    <img src={book.publisher.logo} alt="" className="w-8 h-8 rounded-lg object-cover ring-2 ring-border group-hover/pub:ring-primary transition-colors" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center ring-2 ring-border group-hover/pub:ring-primary transition-colors">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">Publisher</p>
                    <p className="text-sm font-medium text-foreground group-hover/pub:text-primary transition-colors">{book.publisher.name}</p>
                  </div>
                </Link>
                <FollowButton profileId={book.publisher.id} profileType="publisher" />
              </div>
            )}

            {((book as any).allNarrators || (book.formats.audiobook?.narrator?.id ? [book.formats.audiobook.narrator] : [])).map((narrator: any) => (
              narrator?.id && (
                <div key={narrator.id} className="flex items-center justify-center lg:justify-start gap-3 mb-3">
                  <Link to={`/narrator/${narrator.id}`} className="flex items-center gap-3 group/nar cursor-pointer">
                    <img src={narrator.avatar || ""} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-border group-hover/nar:ring-primary transition-colors" />
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">Narrator</p>
                      <p className="text-sm font-medium text-foreground group-hover/nar:text-primary transition-colors">{narrator.name}</p>
                    </div>
                  </Link>
                  <FollowButton profileId={narrator.id} profileType="narrator" />
                </div>
              )
            ))}

            <p className="text-muted-foreground leading-relaxed max-w-2xl mb-6">{stripHtml(book.descriptionBn)}</p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-6">
              {book.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs capitalize">{tag}</Badge>
              ))}
              <Badge variant="secondary" className="text-xs">{book.language}</Badge>
              <Badge variant="secondary" className="text-xs">{book.publishedDate}</Badge>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-3">
              <Button
                variant={bookmarked ? "default" : "outline"}
                size="sm"
                className={`gap-1.5 ${bookmarked ? "" : ""}`}
                onClick={toggleBookmark}
              >
                {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
                {bookmarked ? "Wishlisted" : "Add to Wishlist"}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={share}>
                <Share2 className="w-4 h-4" /> Share
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
