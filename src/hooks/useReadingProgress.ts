import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"

interface ReadingProgressData {
  currentPage: number
  totalPages: number
  percentage: number
  lastReadAt: string | null
}

export function useReadingProgress(bookId: string | undefined) {
  const { user } = useAuth()
  const [progress, setProgress] = useState<ReadingProgressData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !bookId) { setLoading(false); return }
    loadProgress()
  }, [user, bookId])

  const loadProgress = async () => {
    if (!user || !bookId) return
    const { data } = await supabase
      .from("reading_progress")
      .select("*")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .single()

    if (data) {
      setProgress({
        currentPage: data.current_page || 0,
        totalPages: data.total_pages || 0,
        percentage: Number(data.percentage) || 0,
        lastReadAt: data.last_read_at,
      })
    }
    setLoading(false)
  }

  const saveProgress = useCallback(async (currentPage: number, totalPages: number) => {
    if (!user || !bookId) return
    const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0

    await supabase.from("reading_progress").upsert(
      {
        user_id: user.id,
        book_id: bookId,
        current_page: currentPage,
        total_pages: totalPages,
        percentage: Math.min(percentage, 100),
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id", ignoreDuplicates: false }
    )

    setProgress({ currentPage, totalPages, percentage, lastReadAt: new Date().toISOString() })
  }, [user, bookId])

  return { progress, loading, saveProgress, loadProgress }
}
