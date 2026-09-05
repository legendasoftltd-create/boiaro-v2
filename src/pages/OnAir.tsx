import { useEffect } from "react"
import { Link } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RadioCard } from "@/components/LiveRadio"
import { LatestShows } from "@/components/onair/LatestShows"
import { useRadioStations } from "@/hooks/useRadioStation"
import { useAllLiveSessions } from "@/hooks/useLiveSession"
import { useSiteSettings } from "@/hooks/useSiteSettings"
import { trpc } from "@/lib/trpc"
import { Mic, Radio, Calendar, MessageCircle, ChevronRight, Clock } from "lucide-react"

const DAY_NAMES = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"]

/**
 * BoiAro On Air — the app's radio hub.
 *
 * Section order is fixed by requirement 4: Live Radio → Radio Stations →
 * Latest Shows → Upcoming Shows. Live and recorded are deliberately kept
 * apart (requirement 9): a show that just came off air is not here until an
 * admin has published its recording.
 */
export default function OnAir() {
  const { data: stations = [], isLoading: stationsLoading } = useRadioStations()
  const { sessions } = useAllLiveSessions()
  const { get } = useSiteSettings()
  const brandName = get("brand_name", "BoiAro")

  useEffect(() => {
    document.title = `${brandName} On Air`
    return () => { document.title = "BoiAro" }
  }, [brandName])

  const liveByStation = new Map(sessions.filter((s: any) => s.station_id).map((s: any) => [s.station_id as string, s]))
  const liveStations = stations.filter((s) => liveByStation.has(s.id))
  // Stations with nothing live on them right now — the plain "Radio Stations"
  // list, so a live show isn't listed twice on the same screen.
  const idleStations = stations.filter((s) => !liveByStation.has(s.id))

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <Radio className="w-6 h-6 text-destructive" /> {brandName} <span className="text-destructive">On Air</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {sessions.length > 0 ? `${sessions.length}টি শো এখন লাইভ` : "লাইভ রেডিও, স্টেশন আর আগের অনুষ্ঠান — এক জায়গায়"}
          </p>
        </div>

        {/* ── 1. Live Radio ─────────────────────────────────────────────── */}
        {liveStations.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-destructive" />
              <h2 className="text-lg font-serif font-bold">লাইভ রেডিও</h2>
              <Badge variant="secondary" className="bg-destructive/15 text-destructive text-[10px]">LIVE</Badge>
            </div>
            {liveStations.map((station) => {
              const live: any = liveByStation.get(station.id)
              return (
                <div key={station.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">{live.show_title || station.name}</span>
                    <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
                      <Link to={`/live/${live.id}`}><MessageCircle className="w-3.5 h-3.5" /> লাইভ চ্যাটে যোগ দিন</Link>
                    </Button>
                  </div>
                  <RadioCard
                    station={{
                      id: station.id,
                      name: live.rj_profile?.stage_name ? `🎙️ ${live.rj_profile.stage_name} — LIVE` : station.name,
                      stream_url: live.stream_url || station.stream_url,
                      // An ad-hoc live session only ever has one URL — no bitrate
                      // variants, so the quality selector is skipped here.
                      stream_url_medium: null,
                      stream_url_low: null,
                      artwork_url: station.artwork_url,
                      description: live.show_title || station.description,
                    }}
                    isLive
                    liveSessionId={live.id}
                    liveSessionStatus={live.status}
                    startedAt={live.started_at}
                    rjAvatarUrl={live.rj_profile?.avatar_url}
                    stationId={station.id}
                  />
                </div>
              )
            })}
          </section>
        )}

        {/* ── 2. Radio Stations ─────────────────────────────────────────── */}
        {(idleStations.length > 0 || stationsLoading) && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-serif font-bold">রেডিও স্টেশন</h2>
            </div>
            {stationsLoading ? (
              <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" /></div>
            ) : (
              <div className={idleStations.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>
                {idleStations.map((station) => (
                  <RadioCard
                    key={station.id}
                    station={{
                      id: station.id,
                      name: station.name || `${brandName} Radio`,
                      stream_url: station.stream_url,
                      stream_url_medium: station.stream_url_medium,
                      stream_url_low: station.stream_url_low,
                      artwork_url: station.artwork_url,
                      description: station.description,
                    }}
                    isLive={false}
                    stationId={station.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── 3. Latest Shows / সম্প্রতি প্রচারিত ────────────────────────── */}
        <LatestShows limit={5} />

        {/* ── 4. Upcoming Shows ─────────────────────────────────────────── */}
        <UpcomingShows />
      </main>
      <Footer />
    </div>
  )
}

/**
 * The next few slots from the weekly EPG. Full schedule lives on /schedule —
 * this is the On Air page's preview of it.
 */
function UpcomingShows({ limit = 5 }: { limit?: number }) {
  const { data: schedules = [], isLoading } = trpc.rj.showSchedules.useQuery()

  const todayIdx = new Date().getDay()
  const upcoming = (schedules as any[])
    .filter((s) => s.status !== "cancelled")
    .filter((s) => {
      if (s.schedule_type !== "one_time") return true
      // A one-time slot that has already been and gone isn't upcoming.
      return s.specific_date && new Date(s.specific_date) >= new Date(new Date().toDateString())
    })
    .sort((a, b) => {
      if (a.schedule_type === "one_time" && b.schedule_type === "one_time") {
        return new Date(a.specific_date).getTime() - new Date(b.specific_date).getTime()
      }
      // Recurring slots are ordered by how many days away they are, so
      // "today, later" comes before "in six days".
      const da = (a.day_of_week - todayIdx + 7) % 7
      const db = (b.day_of_week - todayIdx + 7) % 7
      return da - db || String(a.start_time).localeCompare(String(b.start_time))
    })
    .slice(0, limit)

  if (isLoading || !upcoming.length) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-serif font-bold">আসন্ন অনুষ্ঠান</h2>
            <p className="text-xs text-muted-foreground">Upcoming Shows</p>
          </div>
        </div>
        <Button asChild size="sm" variant="ghost" className="gap-1 text-xs shrink-0">
          <Link to="/schedule">পুরো সিডিউল <ChevronRight className="w-3.5 h-3.5" /></Link>
        </Button>
      </div>

      <div className="space-y-2">
        {upcoming.map((s: any) => (
          <Card key={s.id} className="border-border/30">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <Link to={`/schedule/${s.id}`} className="text-sm font-medium truncate block hover:underline">{s.show_title}</Link>
                <p className="text-xs text-muted-foreground truncate">
                  {s.rj_stage_name || "RJ"}
                  {s.station?.name ? ` · ${s.station.name}` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium">
                  {s.schedule_type === "one_time" && s.specific_date
                    ? new Date(s.specific_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                    : DAY_NAMES[s.day_of_week]}
                </p>
                <p className="text-[11px] text-muted-foreground">{s.start_time} – {s.end_time}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
