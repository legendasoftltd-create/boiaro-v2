import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useAdminCheck } from "@/hooks/useAdminCheck"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer"
import {
  Loader2, Trash2, Send, Heart, MessageSquare, ChevronDown, RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

const MAX_LEN = 500

interface Props {
  bookId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  commentCount: number
  onCountChange: (n: number) => void
}

export function PlayerCommentsDrawer({ bookId, open, onOpenChange }: Props) {
  const { user } = useAuth()
  const { isAdmin } = useAdminCheck()
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  const utils = trpc.useUtils()

  const { data: rawComments = [], isLoading } = trpc.books.comments.useQuery(
    { bookId, userId: user?.id },
    { enabled: open }
  )

  const postCommentMutation = trpc.books.postComment.useMutation({
    onSuccess: () => {
      utils.books.comments.invalidate({ bookId })
      setText("")
      setReplyTo(null)
    },
    onError: () => toast.error("মন্তব্য পোস্ট করতে ব্যর্থ"),
  })

  const deleteCommentMutation = trpc.books.deleteComment.useMutation({
    onSuccess: () => utils.books.comments.invalidate({ bookId }),
    onError: () => toast.error("মুছতে ব্যর্থ"),
  })

  const toggleLikeMutation = trpc.books.toggleCommentLike.useMutation({
    onSuccess: () => utils.books.comments.invalidate({ bookId }),
    onError: () => toast.error("লাইক করতে ব্যর্থ"),
  })

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || !user) return
    postCommentMutation.mutate({
      bookId,
      content: trimmed,
      parentId: replyTo?.id,
    })
  }

  const CommentItem = ({ c, isReply = false }: { c: any; isReply?: boolean }) => (
    <div className={`flex gap-2.5 ${isReply ? "ml-8 mt-2" : ""}`}>
      <Avatar className="w-7 h-7 shrink-0">
        <AvatarImage src={c.avatar_url || undefined} />
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
          {((c.display_name as string) || "U")[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground truncate">{c.display_name || "User"}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm text-foreground/85 mt-0.5 whitespace-pre-line break-words">{c.comment}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <button
            onClick={() => {
              if (!user) { toast.error("লাইক করতে লগইন করুন"); return }
              toggleLikeMutation.mutate({ commentId: c.id })
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Heart className={`w-3.5 h-3.5 ${c.liked_by_me ? "fill-primary text-primary" : ""}`} />
            {c.like_count > 0 && <span>{c.like_count}</span>}
          </button>
          {!isReply && user && (
            <button
              onClick={() => setReplyTo({ id: c.id, name: c.display_name || "User" })}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              রিপ্লাই
            </button>
          )}
          {(isAdmin || user?.id === c.user_id) && (
            <button
              onClick={() => deleteCommentMutation.mutate({ commentId: c.id })}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {!isReply && c.replies?.length > 0 && !expandedReplies.has(c.id) && (
          <button
            onClick={() => setExpandedReplies(prev => new Set(prev).add(c.id))}
            className="text-xs text-primary/80 hover:text-primary mt-1.5 flex items-center gap-1"
          >
            <ChevronDown className="w-3 h-3" /> রিপ্লাই দেখুন ({c.replies.length})
          </button>
        )}
        {!isReply && expandedReplies.has(c.id) && (c.replies as any[]).map((r: any) => (
          <CommentItem key={r.id} c={r} isReply />
        ))}
      </div>
    </div>
  )

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] bg-[hsl(240,12%,7%)] border-border/30">
        <DrawerHeader className="flex flex-row items-center justify-between pb-2">
          <DrawerTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            মন্তব্য
          </DrawerTitle>
          <Button
            variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground"
            onClick={() => utils.books.comments.invalidate({ bookId })}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-4" style={{ maxHeight: "calc(85vh - 160px)" }}>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : rawComments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              এখনো কোনো মন্তব্য নেই। প্রথম মন্তব্য করুন!
            </p>
          ) : (
            <div className="space-y-4 pb-4">
              {rawComments.map((c: any) => <CommentItem key={c.id} c={c} />)}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border/30 p-3 space-y-2">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-primary/80 bg-primary/5 px-2 py-1 rounded">
              <span>↳ {replyTo.name}-কে রিপ্লাই</span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
            </div>
          )}
          {user ? (
            <div className="flex items-end gap-2">
              <Textarea
                placeholder={replyTo ? "রিপ্লাই লিখুন..." : "মন্তব্য লিখুন..."}
                value={text}
                onChange={e => setText(e.target.value.slice(0, MAX_LEN))}
                className="bg-muted/30 border-border/50 resize-none text-sm min-h-[40px] max-h-[80px]"
                rows={1}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
              />
              <Button
                size="icon" className="shrink-0 w-9 h-9 rounded-full"
                onClick={handleSubmit}
                disabled={!text.trim() || postCommentMutation.isPending}
              >
                {postCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-1">মন্তব্য করতে লগইন করুন</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
