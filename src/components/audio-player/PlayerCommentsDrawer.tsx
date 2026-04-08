import { useState, useCallback, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useAdminCheck } from "@/hooks/useAdminCheck"
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

interface Comment {
  id: string
  comment: string
  created_at: string
  user_id: string
  parent_id: string | null
  display_name: string | null
  avatar_url: string | null
  like_count: number
  liked_by_me: boolean
  replies: Comment[]
}

const PER_PAGE = 15
const MAX_LEN = 500

interface Props {
  bookId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  commentCount: number
  onCountChange: (n: number) => void
}

export function PlayerCommentsDrawer({ bookId, open, onOpenChange, commentCount, onCountChange }: Props) {
  const { user } = useAuth()
  const { isAdmin } = useAdminCheck()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  const fetchComments = useCallback(async (pageNum = 0, append = false) => {
    setLoading(true)
    const from = pageNum * PER_PAGE
    const to = from + PER_PAGE

    // Fetch top-level comments
    const { data, error } = await supabase
      .from("book_comments")
      .select("id, comment, created_at, user_id, parent_id")
      .eq("book_id", bookId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .range(from, to)

    if (error) { setLoading(false); return }

    const rows = data || []
    setHasMore(rows.length > PER_PAGE)
    const sliced = rows.slice(0, PER_PAGE)

    // Get all comment IDs for likes count
    const commentIds = sliced.map(c => c.id)

    // Fetch profiles
    const userIds = [...new Set(sliced.map(c => c.user_id))]
    let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public" as any).select("user_id, display_name, avatar_url").in("user_id", userIds) as any
      if (profiles) profileMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.user_id, p]))
    }

    // Fetch like counts
    let likeCounts: Record<string, number> = {}
    let myLikes = new Set<string>()
    if (commentIds.length > 0) {
      const { data: likes } = await supabase
        .from("comment_likes").select("comment_id").in("comment_id", commentIds)
      if (likes) {
        likes.forEach(l => { likeCounts[l.comment_id] = (likeCounts[l.comment_id] || 0) + 1 })
      }
      if (user) {
        const { data: myL } = await supabase
          .from("comment_likes").select("comment_id")
          .in("comment_id", commentIds).eq("user_id", user.id)
        if (myL) myL.forEach(l => myLikes.add(l.comment_id))
      }
    }

    const mapped: Comment[] = sliced.map(c => ({
      ...c,
      display_name: profileMap[c.user_id]?.display_name || "User",
      avatar_url: profileMap[c.user_id]?.avatar_url || null,
      like_count: likeCounts[c.id] || 0,
      liked_by_me: myLikes.has(c.id),
      replies: [],
    }))

    setComments(prev => append ? [...prev, ...mapped] : mapped)
    setLoading(false)
  }, [bookId, user])

  // Fetch total count
  const fetchCount = useCallback(async () => {
    const { count } = await supabase
      .from("book_comments").select("id", { count: "exact", head: true }).eq("book_id", bookId)
    onCountChange(count || 0)
  }, [bookId, onCountChange])

  // Lazy load on open
  useEffect(() => {
    if (open) {
      setPage(0)
      fetchComments(0)
      fetchCount()
    }
  }, [open, fetchComments, fetchCount])

  const fetchReplies = async (parentId: string) => {
    const { data } = await supabase
      .from("book_comments")
      .select("id, comment, created_at, user_id, parent_id")
      .eq("parent_id", parentId)
      .order("created_at", { ascending: true })

    if (!data || data.length === 0) return

    const userIds = [...new Set(data.map(c => c.user_id))]
    let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public" as any).select("user_id, display_name, avatar_url").in("user_id", userIds) as any
      if (profiles) profileMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.user_id, p]))
    }

    const commentIds = data.map(c => c.id)
    let likeCounts: Record<string, number> = {}
    let myLikes = new Set<string>()
    if (commentIds.length > 0) {
      const { data: likes } = await supabase
        .from("comment_likes").select("comment_id").in("comment_id", commentIds)
      if (likes) likes.forEach(l => { likeCounts[l.comment_id] = (likeCounts[l.comment_id] || 0) + 1 })
      if (user) {
        const { data: myL } = await supabase
          .from("comment_likes").select("comment_id").in("comment_id", commentIds).eq("user_id", user.id)
        if (myL) myL.forEach(l => myLikes.add(l.comment_id))
      }
    }

    const replies: Comment[] = data.map(c => ({
      ...c,
      display_name: profileMap[c.user_id]?.display_name || "User",
      avatar_url: profileMap[c.user_id]?.avatar_url || null,
      like_count: likeCounts[c.id] || 0,
      liked_by_me: myLikes.has(c.id),
      replies: [],
    }))

    setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies } : c))
    setExpandedReplies(prev => new Set(prev).add(parentId))
  }

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || !user) return
    setSubmitting(true)

    const payload: any = { book_id: bookId, user_id: user.id, comment: trimmed }
    if (replyTo) payload.parent_id = replyTo.id

    const { error } = await supabase.from("book_comments").insert(payload)

    if (error) {
      toast.error("মন্তব্য পোস্ট করতে ব্যর্থ")
    } else {
      setText("")
      if (replyTo) {
        fetchReplies(replyTo.id)
        setReplyTo(null)
      } else {
        fetchComments(0)
      }
      fetchCount()
    }
    setSubmitting(false)
  }

  const handleDelete = async (commentId: string, parentId: string | null) => {
    const { error } = await supabase.from("book_comments").delete().eq("id", commentId)
    if (error) { toast.error("মুছতে ব্যর্থ"); return }
    if (parentId) {
      setComments(prev => prev.map(c =>
        c.id === parentId ? { ...c, replies: c.replies.filter(r => r.id !== commentId) } : c
      ))
    } else {
      setComments(prev => prev.filter(c => c.id !== commentId))
    }
    fetchCount()
  }

  const toggleLike = async (commentId: string, liked: boolean, parentId: string | null) => {
    if (!user) { toast.error("লাইক করতে লগইন করুন"); return }

    const updateLike = (list: Comment[]) =>
      list.map(c => {
        if (c.id === commentId) return {
          ...c,
          liked_by_me: !liked,
          like_count: liked ? c.like_count - 1 : c.like_count + 1,
        }
        if (c.replies.length > 0) return { ...c, replies: updateLike(c.replies) }
        return c
      })

    setComments(prev => updateLike(prev))

    if (liked) {
      await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id)
    } else {
      await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: user.id })
    }
  }

  const refresh = () => { setPage(0); fetchComments(0); fetchCount() }

  const CommentItem = ({ c, isReply = false }: { c: Comment; isReply?: boolean }) => (
    <div className={`flex gap-2.5 ${isReply ? "ml-8 mt-2" : ""}`}>
      <Avatar className="w-7 h-7 shrink-0">
        <AvatarImage src={c.avatar_url || undefined} />
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
          {(c.display_name || "U")[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground truncate">{c.display_name}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm text-foreground/85 mt-0.5 whitespace-pre-line break-words">{c.comment}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <button
            onClick={() => toggleLike(c.id, c.liked_by_me, c.parent_id)}
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
              onClick={() => handleDelete(c.id, c.parent_id)}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Reply thread toggle */}
        {!isReply && !expandedReplies.has(c.id) && (
          <button
            onClick={() => fetchReplies(c.id)}
            className="text-xs text-primary/80 hover:text-primary mt-1.5 flex items-center gap-1"
          >
            <ChevronDown className="w-3 h-3" /> রিপ্লাই দেখুন
          </button>
        )}
        {!isReply && expandedReplies.has(c.id) && c.replies.map(r => (
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
            মন্তব্য {commentCount > 0 && <span className="text-xs text-muted-foreground font-normal">({commentCount})</span>}
          </DrawerTitle>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={refresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-4" style={{ maxHeight: "calc(85vh - 160px)" }}>
          {loading && comments.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              এখনো কোনো মন্তব্য নেই। প্রথম মন্তব্য করুন!
            </p>
          ) : (
            <div className="space-y-4 pb-4">
              {comments.map(c => <CommentItem key={c.id} c={c} />)}
              {hasMore && (
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => { const n = page + 1; setPage(n); fetchComments(n, true) }}
                >
                  আরো দেখুন
                </Button>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
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
                disabled={!text.trim() || submitting}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
