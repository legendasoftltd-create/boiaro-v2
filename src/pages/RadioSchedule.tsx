import { useEffect } from "react"
import { Link } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/lib/trpc"
import { Calendar, Clock } from "lucide-react"
import { ShareButton } from "@/components/ShareButton"

const DAY_NAMES = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"]

export default function RadioSchedule() {
  const { data: schedules = [], isLoading } = trpc.rj.showSchedules.useQuery()
  useEffect(() => {
    document.title = "শো সিডিউল — BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [])

  const recurring = (schedules as any[]).filter((s) => s.schedule_type !== "one_time")
  const upcoming = (schedules as any[])
    .filter((s) => s.schedule_type === "one_time" && s.specific_date && new Date(s.specific_date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.specific_date).getTime() - new Date(b.specific_date).getTime())

  const byDay = DAY_NAMES.map((name, i) => ({
    day: name,
    shows: recurring.filter((s) => s.day_of_week === i),
  }))

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-3xl">
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2 mb-1">
          <Calendar className="w-6 h-6 text-primary" /> শো সিডিউল
        </h1>
        <p className="text-muted-foreground text-sm mb-6">সাপ্তাহিক লাইভ শো-এর সময়সূচী</p>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : schedules.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">এখনো কোনো শো নির্ধারণ করা হয়নি।</p>
        ) : upcoming.length === 0 && byDay.every((d) => d.shows.length === 0) ? (
          // Schedules exist, but every one-time slot's date has already
          // passed and there are no recurring slots — without this, the
          // page below silently renders nothing.
          <p className="text-center text-muted-foreground py-16">এই মুহূর্তে কোনো আসন্ন শো নেই।</p>
        ) : (
          <div className="space-y-5">
            {upcoming.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">বিশেষ শো (একবার প্রচারিত)</h2>
                <div className="space-y-2">
                  {upcoming.map((s: any) => (
                    <Card key={s.id} id={s.id} className="border-border/30">
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/schedule/${s.id}`} className="text-sm font-medium hover:underline">{s.show_title}</Link>
                          <p className="text-xs text-muted-foreground">
                            <Link to={`/host/${s.rj_user_id}`} className="hover:text-foreground hover:underline">{s.rj_stage_name || "RJ"}</Link> · {s.station?.name} · {new Date(s.specific_date).toLocaleDateString(undefined, { timeZone: "Asia/Dhaka" })}
                          </p>
                          {s.description && <p className="text-xs text-muted-foreground/80 mt-1">{s.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {s.start_time} - {s.end_time}</Badge>
                          <ShareButton title={s.show_title} url={`${window.location.origin}/schedule/${s.id}`} className="h-8 w-8" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {byDay.filter((d) => d.shows.length > 0).map((d) => (
              <div key={d.day} id={d.shows[0]?.id}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">{d.day}</h2>
                <div className="space-y-2">
                  {d.shows.map((s: any) => (
                    <Card key={s.id} id={s.id} className="border-border/30">
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/schedule/${s.id}`} className="text-sm font-medium hover:underline">{s.show_title}</Link>
                          <p className="text-xs text-muted-foreground">
                            <Link to={`/host/${s.rj_user_id}`} className="hover:text-foreground hover:underline">{s.rj_stage_name || "RJ"}</Link> · {s.station?.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {s.start_time} - {s.end_time}</Badge>
                          <ShareButton title={s.show_title} url={`${window.location.origin}/schedule/${s.id}`} className="h-8 w-8" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
