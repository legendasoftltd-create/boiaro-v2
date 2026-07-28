import { useEffect } from "react"
import { Link } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { toMediaUrl } from "@/lib/mediaUrl"
import { Headphones, Play, Pause, Radio } from "lucide-react"
import type { MasterBook, AudiobookFormat } from "@/lib/types"

export default function RadioCatchup() {
  const { data, isLoading } = trpc.rj.catchupSessions.useQuery({ limit: 20 })
  const { book, isPlaying, currentTime, duration, togglePlay, loadBook, seekTo } = useAudioPlayer()
  const saveProgress = trpc.rj.saveCatchupProgress.useMutation()
  const recordPlay = trpc.rj.recordCatchupPlay.useMutation()
  const utils = trpc.useUtils()

  useEffect(() => {
    document.title = "ক্যাচ-আপ অডিও — BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [])

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-3xl">
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2 mb-1">
          <Headphones className="w-6 h-6 text-primary" /> ক্যাচ-আপ অডিও
        </h1>
        <p className="text-muted-foreground text-sm mb-6">পুরোনো লাইভ শো শুনুন, যেকোনো সময়</p>

        {isLoading ? (
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
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
