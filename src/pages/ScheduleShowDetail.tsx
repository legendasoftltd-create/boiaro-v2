import { useEffect } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShareButton } from "@/components/ShareButton"
import { trpc } from "@/lib/trpc"
import { Calendar, Clock, Radio } from "lucide-react"

const DAY_NAMES = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"]

export default function ScheduleShowDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: schedule, isLoading } = trpc.rj.showScheduleById.useQuery({ id: id! }, { enabled: !!id })

  useEffect(() => {
    if (schedule) document.title = `${schedule.show_title} — BoiAro On Air`
    return () => { document.title = "BoiAro" }
  }, [schedule])

  useEffect(() => {
    if (!isLoading && schedule === null) navigate("/schedule", { replace: true })
  }, [isLoading, schedule, navigate])

  if (isLoading || !schedule) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex justify-center py-24"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      </div>
    )
  }

  const when = schedule.schedule_type === "one_time" && schedule.specific_date
    ? new Date(schedule.specific_date).toLocaleDateString("bn-BD", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" })
    : DAY_NAMES[schedule.day_of_week]

  const shareUrl = `${window.location.origin}/schedule/${schedule.id}`

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-2xl">
        <Card className="border-border/30 overflow-hidden">
          {schedule.cover_image_url && (
            <img src={schedule.cover_image_url} alt="" className="w-full h-48 object-cover" />
          )}
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-serif font-bold flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary shrink-0" /> {schedule.show_title}
              </h1>
              <ShareButton title={schedule.show_title} url={shareUrl} className="shrink-0" />
            </div>

            <p className="text-sm text-muted-foreground">
              <Link to={`/host/${schedule.rj_user_id}`} className="hover:text-foreground hover:underline">
                {schedule.rj_stage_name || "RJ"}
              </Link>{" "}
              সঞ্চালনা করছেন · {schedule.station?.name}
            </p>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1"><Calendar className="w-3 h-3" /> {when}</Badge>
              <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {schedule.start_time} - {schedule.end_time}</Badge>
            </div>

            {schedule.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{schedule.description}</p>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  )
}
