import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"

export function useBookEngagement(bookId: string) {
  const { user } = useAuth()
  const trackedKey = useRef<string | null>(null)
  const [liveReads, setLiveReads] = useState<number | null>(null)
  const [liveRating, setLiveRating] = useState<number | null>(null)
  const [liveReviewsCount, setLiveReviewsCount] = useState<number | null>(null)

  const fetchReads = useCallback(async () => {
    const { count } = await supabase
      .from("book_reads")
      .select("*", { count: "exact", head: true })
      .eq("book_id", bookId)
    if (count !== null) setLiveReads(count)
  }, [bookId])

  // Track a unique read for this user+book (deduplicated)
  const trackRead = useCallback(async () => {
    if (!user || !bookId) return

    // Check localStorage to prevent spamming on refresh
    const key = `read_${bookId}_${user.id}`
    if (trackedKey.current === key) return
    trackedKey.current = key

    const lastRead = localStorage.getItem(key)
    const now = Date.now()
    if (lastRead && now - Number(lastRead) < 3600000) return // 1 hour cooldown

    localStorage.setItem(key, String(now))

    const { data, error } = await supabase.rpc("post_read_increment", {
      p_book_id: bookId,
    })

    if (error) {
      if (import.meta.env.DEV) {
        console.error("[useBookEngagement] post_read_increment failed", error)
      }
      return
    }

    const parsed = typeof data === "string" ? JSON.parse(data) : data
    if (typeof parsed?.reads_count === "number") {
      setLiveReads(parsed.reads_count)
      return
    }

    fetchReads()
  }, [user, bookId, fetchReads])

  const refreshReviewStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("refresh_book_review_stats", { p_book_id: bookId })
    if (error) {
      if (import.meta.env.DEV) {
        console.error("[useBookEngagement] refresh_book_review_stats failed", error)
      }
      return
    }

    if (data) {
      const parsed = typeof data === "string" ? JSON.parse(data) : data
      setLiveRating(Number(parsed.avg_rating) || 0)
      setLiveReviewsCount(parsed.reviews_count || 0)
    }
  }, [bookId])

  useEffect(() => {
    if (!bookId) return
    fetchReads()
    refreshReviewStats()
  }, [bookId, fetchReads, refreshReviewStats])

  return {
    liveReads,
    liveRating,
    liveReviewsCount,
    trackRead,
    refreshReviewStats,
  }
}
