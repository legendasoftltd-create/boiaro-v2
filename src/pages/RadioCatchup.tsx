import { useEffect, useState, useRef } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/AuthContext"
import { trpc } from "@/lib/trpc"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { toMediaUrl } from "@/lib/mediaUrl"
import { Headphones, Play, Pause, Radio, Share2, History, CheckCircle2, Flag } from "lucide-react"
import { toast } from "sonner"

const REPORT_REASONS = [
  { value: "copyright", label: "কপিরাইট লঙ্ঘন" },
  { value: "inappropriate", label: "আপত্তিকর কনটেন্ট" },
  { value: "other", label: "অন্যান্য" },
]
import type { MasterBook, AudiobookFormat } from "@/lib/types"

export default function RadioCatchup() {
  const { user } = useAuth()
  const [tab, setTab] = useState<"browse" | "history">("browse")
  const [searchParams] = useSearchParams()
  const { data, isLoading } = trpc.rj.catchupSessions.useQuery({ limit: 20 })
  const { data: history = [], isLoading: historyLoading } = trpc.rj.myCatchupHistory.useQuery(undefined, { enabled: !!user && tab === "history" })
  const { book, isPlaying, currentTime, duration, togglePlay, loadBook, seekTo } = useAudioPlayer()
  const saveProgress = trpc.rj.saveCatchupProgress.useMutation()
  const recordPlay = trpc.rj.recordCatchupPlay.useMutation()
  const utils = trpc.useUtils()
  const autoPlayedRef = useRef(false)

  useEffect(() => {
    document.title = "ক্যাচ-আপ অডিও — BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [])

  // Deep link from a shared catch-up link (?session=<id>) — auto-play once
  // the browse list has loaded and contains it.
  useEffect(() => {
    const sessionId = searchParams.get("session")
    if (!sessionId || autoPlayedRef.current || !data?.sessions?.length) return
    const target = data.sessions.find((s: any) => s.id === sessionId)
    if (target) {
      autoPlayedRef.current = true
      handlePlay(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchParams])

  // Periodically persist playback position for whichever catch-up recording
  // is currently active, so it can resume from here next time.
  useEffect(() => {
    if (!book?.id?.startsWith("catchup-") || !isPlaying || !currentTime) return
    const sessionId = book.id.replace("catchup-", "")
    const timer = setInterval(() => {
      saveProgress.mutate({ sessionId, positionSeconds: Math.floor(currentTime), durationSeconds: duration ? Math.floor(duration) : undefined })
    }, 15_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, isPlaying])

  const sessions = data?.sessions ?? []

  const handlePlay = async (session: any) => {
    const bookId = `catchup-${session.id}`
    if (book?.id === bookId) {
      togglePlay()
      return
    }
    recordPlay.mutate({ sessionId: session.id })
    const resumeAt = await utils.rj.myCatchupProgress.fetch({ sessionId: session.id }).catch(() => null)
    const masterBook: MasterBook = {
      id: bookId,
      title: session.show_title || "Recorded Show",
      titleEn: "", slug: bookId,
      cover: session.station?.artwork_url || "/placeholder.svg",
      description: `${session.rj_stage_name || "RJ"} · ${session.station?.name || ""}`,
      descriptionBn: "", language: "bn",
      isFeatured: false, isBestseller: false, isNew: false, isFree: true,
      rating: 0, reviewsCount: 0, totalReads: "0", publishedDate: "", tags: [],
      author: { id: "", name: session.rj_stage_name || "RJ", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false },
      category: { id: "", name: "Catch-up", nameBn: "ক্যাচ-আপ", icon: "", count: "0", color: "" },
      publisher: { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false },
      formats: { audiobook: { available: true, price: 0, duration: "", narrator: { id: "", name: session.rj_stage_name || "RJ", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false }, chapters: 1, quality: "standard" } },
    }
    const audiobook: AudiobookFormat = { available: true, price: 0, duration: "", narrator: { id: "", name: "", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false }, chapters: 1, quality: "standard" }
    const track = { id: session.id, trackNumber: 1, title: session.show_title || "Recorded Show", duration: "", audioUrl: session.recording_url, isPreview: false, isActive: true }
    loadBook(masterBook, audiobook, [track])
    const resumePosition = (resumeAt as any)?.position_seconds
    setTimeout(() => {
      togglePlay()
      if (resumePosition > 5) seekTo(resumePosition) // skip trivial resumes near the start
    }, 300)
  }

  const [reportTarget, setReportTarget] = useState<{ id: string; title: string } | null>(null)
  const [reportReason, setReportReason] = useState("copyright")
  const [reportDetails, setReportDetails] = useState("")
  const reportMutation = trpc.rj.liveSession.reportContent.useMutation({
    onSuccess: () => { toast.success("রিপোর্ট জমা দেওয়া হয়েছে — ধন্যবাদ"); setReportTarget(null); setReportDetails("") },
    onError: (e) => toast.error(e.message),
  })
  const submitReport = () => {
    if (!reportTarget) return
    const label = REPORT_REASONS.find((r) => r.value === reportReason)?.label ?? reportReason
    reportMutation.mutate({
      sessionId: reportTarget.id,
      targetType: "recording",
      targetId: reportTarget.id,
      reason: reportDetails.trim() ? `${label}: ${reportDetails.trim()}` : label,
    })
  }

  const handleShare = async (sessionId: string, showTitle: string) => {
    const url = `${window.location.origin}/catchup?session=${sessionId}`
    if (navigator.share) {
      try { await navigator.share({ title: showTitle, url }); return } catch { /* user cancelled or unsupported — fall through to copy */ }
    }
    await navigator.clipboard.writeText(url)
    toast.success("লিংক কপি হয়েছে")
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-3xl">
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2 mb-1">
          <Headphones className="w-6 h-6 text-primary" /> ক্যাচ-আপ অডিও
        </h1>
        <p className="text-muted-foreground text-sm mb-4">পুরোনো লাইভ শো শুনুন, যেকোনো সময়</p>

        {user && (
          <div className="flex gap-2 mb-4">
            <Button size="sm" variant={tab === "browse" ? "default" : "outline"} className="text-xs" onClick={() => setTab("browse")}>সব শো</Button>
            <Button size="sm" variant={tab === "history" ? "default" : "outline"} className="text-xs gap-1.5" onClick={() => setTab("history")}>
              <History className="w-3.5 h-3.5" /> আমার শোনা
            </Button>
          </div>
        )}

        {tab === "browse" ? (
          isLoading ? (
            <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16">
              <Radio className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">এখনো কোনো রেকর্ডিং নেই।</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: any) => {
                const isActive = book?.id === `catchup-${s.id}`
                const isThisPlaying = isActive && isPlaying
                return (
                  <Card key={s.id} className="border-border/30">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Button size="icon" className="w-11 h-11 rounded-full shrink-0" onClick={() => handlePlay(s)}>
                        {isThisPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.show_title || "Recorded Show"}</p>
                        <p className="text-xs text-muted-foreground">
                          <Link to={`/host/${s.rj_user_id}`} className="hover:text-foreground hover:underline">{s.rj_stage_name || "RJ"}</Link>
                          {" · "}{new Date(s.started_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => handleShare(s.id, s.show_title || "Recorded Show")}>
                        <Share2 className="w-4 h-4" />
                      </Button>
                      {user && (
                        <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => setReportTarget({ id: s.id, title: s.show_title || "Recorded Show" })}>
                          <Flag className="w-4 h-4" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )
        ) : historyLoading ? (
          <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-16">
            <History className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">আপনি এখনো কোনো ক্যাচ-আপ শোনেননি।</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((row: any) => {
              const s = row.session
              if (!s) return null
              const bookId = `catchup-${s.id}`
              const isActive = book?.id === bookId
              const isThisPlaying = isActive && isPlaying
              const pct = row.duration_seconds ? Math.min(100, Math.round((row.position_seconds / row.duration_seconds) * 100)) : null
              return (
                <Card key={row.id} className="border-border/30">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Button
                      size="icon"
                      className="w-11 h-11 rounded-full shrink-0"
                      onClick={() => handlePlay({ id: s.id, show_title: s.show_title, recording_url: s.recording_url, rj_stage_name: null })}
                    >
                      {isThisPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.show_title || "Recorded Show"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {row.completed && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        {row.completed ? "সম্পূর্ণ শোনা হয়েছে" : pct != null ? `${pct}% শোনা হয়েছে` : "শোনা শুরু হয়েছে"}
                        {" · "}{new Date(row.last_played_at ?? row.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => handleShare(s.id, s.show_title || "Recorded Show")}>
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
      <Footer />

      <Dialog open={!!reportTarget} onOpenChange={(open) => { if (!open) setReportTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>রিপোর্ট করুন</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{reportTarget?.title}</p>
            <Select value={reportReason} onValueChange={setReportReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="বিস্তারিত লিখুন (ঐচ্ছিক)"
              rows={3}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReportTarget(null)} disabled={reportMutation.isPending}>বাতিল</Button>
            <Button size="sm" onClick={submitReport} disabled={reportMutation.isPending}>জমা দিন</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
