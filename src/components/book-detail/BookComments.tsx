import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { useAuth } from "@/contexts/AuthContext"
import { useAdminCheck } from "@/hooks/useAdminCheck"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Trash2, MessageSquare, Send } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

const MAX_COMMENT_LENGTH = 1000

export function BookComments({ bookId }: { bookId: string }) {
  const { user } = useAuth()
  const { isAdmin } = useAdminCheck()
  const [text, setText] = useState("")

  const utils = trpc.useUtils()
  const { data: rawComments = [], isLoading: loading } = trpc.books.comments.useQuery({ bookId })
  const postCommentMutation = trpc.books.postComment.useMutation({
    onSuccess: () => { utils.books.comments.invalidate({ bookId }); setText(""); toast.success("Comment posted!") },
    onError: () => toast.error("Failed to post comment"),
  })
  const deleteCommentMutation = trpc.books.deleteComment.useMutation({
    onSuccess: () => { utils.books.comments.invalidate({ bookId }); toast.success("Comment deleted") },
    onError: () => toast.error("Failed to delete comment"),
  })

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || !user) return
    postCommentMutation.mutate({ bookId, content: trimmed })
  }

  const handleDelete = (commentId: string) => {
    deleteCommentMutation.mutate({ commentId })
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
              disabled={!text.trim() || postCommentMutation.isPending}
              className="gap-1.5"
            >
              {postCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
      ) : rawComments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">এখনো কোনো মন্তব্য নেই।</p>
      ) : (
        <div className="space-y-4">
          {(rawComments as any[]).map(c => (
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

          {false && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={() => {}}>
                আরো দেখুন
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
