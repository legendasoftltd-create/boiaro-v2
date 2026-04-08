import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useAdminCheck } from "@/hooks/useAdminCheck"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Trash2, MessageSquare, Send } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface Comment {
  id: string
  comment: string
  created_at: string
  user_id: string
  display_name: string | null
  avatar_url: string | null
}

const COMMENTS_PER_PAGE = 10
const MAX_COMMENT_LENGTH = 1000

export function BookComments({ bookId }: { bookId: string }) {
  const { user } = useAuth()
  const { isAdmin } = useAdminCheck()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [text, setText] = useState("")
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)

  const fetchComments = useCallback(async (pageNum = 0, append = false) => {
    const from = pageNum * COMMENTS_PER_PAGE
    const to = from + COMMENTS_PER_PAGE

    const { data, error } = await supabase
      .from("book_comments")
      .select("id, comment, created_at, user_id")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .range(from, to)

    if (error) {
      console.error("Failed to fetch comments", error)
      setLoading(false)
      return
    }

    const rows = data || []
    setHasMore(rows.length > COMMENTS_PER_PAGE)
    const sliced = rows.slice(0, COMMENTS_PER_PAGE)

    // Fetch profile display names
    const userIds = [...new Set(sliced.map(c => c.user_id))]
    let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {}

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public" as any)
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds) as any

      if (profiles) {
        profileMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.user_id, p]))
      }
    }

    const mapped: Comment[] = sliced.map(c => ({
      ...c,
      display_name: profileMap[c.user_id]?.display_name || "User",
      avatar_url: profileMap[c.user_id]?.avatar_url || null,
    }))

    setComments(prev => append ? [...prev, ...mapped] : mapped)
    setLoading(false)
  }, [bookId])

  useEffect(() => {
    setComments([])
    setPage(0)
    setLoading(true)
    fetchComments(0)
  }, [bookId, fetchComments])

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || !user) return

    setSubmitting(true)
    const { error } = await supabase
      .from("book_comments")
      .insert({ book_id: bookId, user_id: user.id, comment: trimmed })

    if (error) {
      toast.error("Failed to post comment")
    } else {
      setText("")
      fetchComments(0)
      toast.success("Comment posted!")
    }
    setSubmitting(false)
  }

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase
      .from("book_comments")
      .delete()
      .eq("id", commentId)

    if (error) {
      toast.error("Failed to delete comment")
    } else {
      setComments(prev => prev.filter(c => c.id !== commentId))
      toast.success("Comment deleted")
    }
  }

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchComments(next, true)
  }

  return (
    <section className="max-w-4xl mx-auto px-4 py-4">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-primary" />
        মন্তব্য
      </h2>

      {/* Comment input */}
      {user ? (
        <div className="mb-4 space-y-2">
          <Textarea
            placeholder="আপনার মন্তব্য লিখুন..."
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
            className="bg-muted/50 border-border resize-none"
            rows={3}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{text.length}/{MAX_COMMENT_LENGTH}</span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              পোস্ট করুন
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">মন্তব্য করতে লগইন করুন।</p>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">এখনো কোনো মন্তব্য নেই।</p>
      ) : (
        <div className="space-y-4">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarImage src={c.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {(c.display_name || "U")[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{c.display_name || "User"}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                    {(isAdmin || user?.id === c.user_id) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-destructive/70 hover:text-destructive"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground/80 mt-1 whitespace-pre-line break-words">{c.comment}</p>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={loadMore}>
                আরো দেখুন
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
