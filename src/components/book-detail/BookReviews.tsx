import { useState } from "react"
import { Star, MessageSquare, Send, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { trpc } from "@/lib/trpc"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"
import type { MasterBook } from "@/lib/types"

interface Props {
  book: MasterBook
  onReviewChange?: () => void
}

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  user_id: string
  display_name?: string | null
}

function StarRating({
  value,
  interactive = false,
  size = "w-4 h-4",
  onRate,
}: {
  value: number
  interactive?: boolean
  size?: string
  onRate?: (v: number) => void
}) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={!interactive}
          className={interactive ? "cursor-pointer touch-manipulation" : "cursor-default"}
          onMouseEnter={() => interactive && setHover(s)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onRate?.(s)}
        >
          <Star
            className={`${size} transition-colors ${
              s <= (interactive ? hover || value : value)
                ? "fill-primary text-primary"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  )
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

export function BookReviews({ book, onReviewChange }: Props) {
  const { user } = useAuth()
  const utils = trpc.useUtils()
  const [showForm, setShowForm] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)

  const { data: reviews = [], isLoading: loading } = trpc.books.reviews.useQuery(
    { bookId: book.id },
    { staleTime: 60_000 }
  )
  const postReviewMutation = trpc.books.postReview.useMutation({
    onSuccess: () => { utils.books.reviews.invalidate({ bookId: book.id }); onReviewChange?.() },
  })
  const deleteReviewMutation = trpc.books.deleteReview.useMutation({
    onSuccess: () => { utils.books.reviews.invalidate({ bookId: book.id }); onReviewChange?.() },
  })

  const existingReview = user ? (reviews as Review[]).find((r) => r.user_id === user.id) : null

  const totalReviews = reviews.length
  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0

  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  reviews.forEach((r) => {
    if (r.rating >= 1 && r.rating <= 5) dist[r.rating]++
  })

  const openForm = (review?: Review) => {
    if (!user) {
      toast.error("Please login to rate or review")
      return
    }
    if (review) {
      setEditingReviewId(review.id)
      setRating(review.rating)
      setComment(review.comment || "")
    } else if (existingReview) {
      setEditingReviewId(existingReview.id)
      setRating(existingReview.rating)
      setComment(existingReview.comment || "")
    } else {
      setEditingReviewId(null)
      setRating(5)
      setComment("")
    }
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingReviewId(null)
    setRating(5)
    setComment("")
  }

  const handleRate = (nextRating: number) => {
    setRating(nextRating)
  }

  const submit = async () => {
    if (!user) { toast.error("Please login to rate or review"); return }
    if (!comment.trim()) { toast.error("Please write a review before submitting"); return }
    const isUpdate = Boolean(editingReviewId || existingReview)
    try {
      await postReviewMutation.mutateAsync({ bookId: book.id, rating, comment: comment.trim() })
      toast.success(isUpdate ? "Review updated!" : "Review submitted!")
      closeForm()
    } catch (e: any) {
      toast.error(e.message || "Failed to submit review")
    }
  }

  const deleteReview = async (id: string) => {
    await deleteReviewMutation.mutateAsync({ reviewId: id })
    toast.success("Review deleted")
    if (editingReviewId === id) closeForm()
  }

  return (
    <section className="container mx-auto px-4 lg:px-8 py-4 lg:py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-serif font-bold text-foreground">
            Reviews ({totalReviews})
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => (showForm ? closeForm() : openForm())}
          >
            {showForm ? (
              <>Cancel</>
            ) : existingReview ? (
              <>
                <Pencil className="w-4 h-4" /> Edit Your Review
              </>
            ) : (
              <>
                <MessageSquare className="w-4 h-4" /> Write a Review
              </>
            )}
          </Button>
        </div>

        {/* Review form */}
        {showForm && (
          <Card className="bg-card border-primary/20 mb-4">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  {editingReviewId ? "Update Your Rating" : "Your Rating"}
                </p>
                <StarRating
                  value={rating}
                  interactive
                  size="w-7 h-7 sm:w-8 sm:h-8"
                  onRate={handleRate}
                />
              </div>
              <Textarea
                placeholder="Share your thoughts about this book..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="text-base"
              />
              {!user && (
                <p className="text-sm text-destructive">
                  Please sign in to submit a review.
                </p>
              )}
              <Button
                onClick={submit}
                disabled={postReviewMutation.isPending || !user}
                className="gap-2 w-full sm:w-auto"
              >
                <Send className="w-4 h-4" />
                {postReviewMutation.isPending
                  ? "Submitting..."
                  : editingReviewId
                  ? "Update Review"
                  : "Submit Review"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Rating summary */}
        {totalReviews > 0 && (
          <Card className="bg-card border-border mb-4">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <div className="text-center shrink-0">
                  <p className="text-4xl font-bold font-serif text-primary">
                    {avgRating.toFixed(1)}
                  </p>
                  <StarRating value={Math.round(avgRating)} />
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalReviews} review{totalReviews !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex-1 w-full space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = dist[star] || 0
                    const pct =
                      totalReviews > 0
                        ? Math.round((count / totalReviews) * 100)
                        : 0
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-xs w-3 text-muted-foreground">
                          {star}
                        </span>
                        <Star className="w-3 h-3 fill-primary text-primary" />
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">
                          {pct}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review list */}
        {loading ? (
          <div className="text-center text-muted-foreground py-8 animate-pulse">
            Loading reviews...
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => {
              const name =
                (review as any).display_name || "Reader"
              const isOwn = user?.id === review.user_id
              return (
                <Card
                  key={review.id}
                  className={`bg-card border-border ${
                    isOwn ? "ring-1 ring-primary/20" : ""
                  }`}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-foreground">
                          {name}
                        </span>
                        {isOwn && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(review.created_at)}
                        </span>
                        {isOwn && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => openForm(review)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-destructive"
                              onClick={() => deleteReview(review.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <StarRating value={review.rating} />
                    {review.comment && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {review.comment}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
            {reviews.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No reviews yet. Be the first to review!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
