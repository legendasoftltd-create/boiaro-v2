import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/lib/trpc"
import { Calendar, Clock } from "lucide-react"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default function RjSchedule() {
  const { data: schedules = [], isLoading } = trpc.rj.myShowSchedules.useQuery()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold font-serif">My Schedule</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" /> Show Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No slots assigned yet — coordinate with admin for your time slots.
            </p>
          ) : (
            (schedules as any[]).map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-secondary/10">
                <div>
                  <p className="text-sm font-medium">{s.show_title}</p>
                  <p className="text-xs text-muted-foreground">{DAY_NAMES[s.day_of_week]} · {s.station?.name}</p>
                </div>
                <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {s.start_time} - {s.end_time}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
