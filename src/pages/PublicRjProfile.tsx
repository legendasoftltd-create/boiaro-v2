import { useParams, Link } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { FollowButton } from "@/components/FollowButton"
import { trpc } from "@/lib/trpc"
import { toMediaUrl } from "@/lib/mediaUrl"
import { stripHtml } from "@/lib/stripHtml"
import { useAllLiveSessions } from "@/hooks/useLiveSession"
import { Mic, Clock, Calendar } from "lucide-react"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default function PublicRjProfile() {
  const { userId } = useParams<{ userId: string }>()
  const { data: rj, isLoading } = trpc.rj.profileById.useQuery({ userId: userId! }, { enabled: !!userId })
  const { data: allSchedules = [] } = trpc.rj.showSchedules.useQuery()
  // Several RJs can be live at once (different stations) — find THIS RJ's
  // own session rather than assuming whichever session is platform-wide
  // most-recent belongs to them.
  const { sessions: liveSessions } = useAllLiveSessions()
  const liveSession = liveSessions.find((s) => s.rj_user_id === userId)

  const mySchedules = (allSchedules as any[]).filter((s) => s.rj_user_id === userId)
  const isLiveNow = !!liveSession

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading...</div>
      </main>
    )
  }

  if (!rj) {
    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">RJ not found</div>
        <Footer />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-20 pb-10 max-w-3xl">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-8">
          <div className="relative w-32 h-32 rounded-full overflow-hidden ring-2 ring-destructive/20 flex-shrink-0 bg-destructive/10 flex items-center justify-center">
            {rj.avatar_url ? (
              <img src={toMediaUrl(rj.avatar_url) || ""} alt={rj.stage_name} className="w-full h-full object-cover" />
            ) : (
              <Mic className="w-12 h-12 text-destructive" />
            )}
            {isLiveNow && (
              <span className="absolute bottom-1 right-1 bg-destructive text-destructive-foreground text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
            )}
          </div>
          <div className="text-center md:text-left flex-1">
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">{rj.stage_name}</h1>
            {rj.specialty && <p className="text-sm text-muted-foreground mt-1">{rj.specialty}</p>}
            {rj.bio && <p className="text-sm text-muted-foreground mt-3 max-w-xl">{stripHtml(rj.bio)}</p>}
            <div className="mt-4 flex items-center gap-2 justify-center md:justify-start">
              <FollowButton profileId={rj.user_id} profileType="rj" showCount />
              {isLiveNow && liveSession && (
                <Link to={`/live/${liveSession.id}`} className="inline-flex items-center rounded-full bg-destructive text-destructive-foreground px-2.5 py-0.5 text-xs font-semibold hover:bg-destructive/80 transition-colors">
                  Listen Live Now
                </Link>
              )}
            </div>
          </div>
        </div>

        <Card className="border-border/30">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-primary" /> Show Schedule</h2>
            {mySchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled shows yet.</p>
            ) : (
              <div className="space-y-2">
                {mySchedules.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/10">
                    <div>
                      <p className="text-[13px] font-medium">{s.show_title}</p>
                      <p className="text-[11px] text-muted-foreground">{DAY_NAMES[s.day_of_week]} · {s.station?.name}</p>
                    </div>
                    <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {s.start_time}-{s.end_time}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </main>
  )
}
