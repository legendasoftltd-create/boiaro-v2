import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "lucide-react"

export default function RjSchedule() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold font-serif">My Schedule</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" /> Show Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Show scheduling will be available in Phase 3. For now, coordinate with admin for your time slots.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
