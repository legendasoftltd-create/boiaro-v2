import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { trpc } from "@/lib/trpc"
import { Calendar, Clock, CalendarClock, Ban } from "lucide-react"
import { toast } from "sonner"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const REQUEST_STATUS_STYLE: Record<string, string> = {
  pending: "text-amber-500 border-amber-500/30",
  approved: "text-emerald-500 border-emerald-500/30",
  rejected: "text-destructive border-destructive/30",
}

export default function RjSchedule() {
  const utils = trpc.useUtils()
  const { data: schedules = [], isLoading } = trpc.rj.myShowSchedules.useQuery()
  const { data: requests = [] } = trpc.rj.myScheduleChangeRequests.useQuery()

  const requestMutation = trpc.rj.requestScheduleChange.useMutation({
    onSuccess: () => { utils.rj.myScheduleChangeRequests.invalidate(); toast.success("Request sent to admin for review"); setTarget(null) },
    onError: (e) => toast.error(e.message),
  })

  const [target, setTarget] = useState<any | null>(null)
  const [mode, setMode] = useState<"cancel" | "reschedule">("cancel")
  const [reason, setReason] = useState("")
  const [newDay, setNewDay] = useState("0")
  const [newStart, setNewStart] = useState("18:00")
  const [newEnd, setNewEnd] = useState("19:00")

  const openRequest = (s: any, m: "cancel" | "reschedule") => {
    setTarget(s)
    setMode(m)
    setReason("")
    setNewDay(String(s.day_of_week))
    setNewStart(s.start_time)
    setNewEnd(s.end_time)
  }

  const submit = () => {
    if (!target) return
    requestMutation.mutate({
      scheduleId: target.id,
      requestType: mode,
      ...(mode === "reschedule" ? { proposedDayOfWeek: Number(newDay), proposedStartTime: newStart, proposedEndTime: newEnd } : {}),
      reason: reason || undefined,
    })
  }

  const pendingByScheduleId = new Set((requests as any[]).filter((r) => r.status === "pending").map((r) => r.schedule_id))

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
              <div key={s.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border/20 bg-secondary/10">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.show_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.schedule_type === "one_time" && s.specific_date ? new Date(s.specific_date).toLocaleDateString() : DAY_NAMES[s.day_of_week]} · {s.station?.name}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {s.start_time} - {s.end_time}</Badge>
                  {pendingByScheduleId.has(s.id) ? (
                    <Badge variant="outline" className="text-amber-500 border-amber-500/30">Request pending</Badge>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Request reschedule" onClick={() => openRequest(s, "reschedule")}><CalendarClock className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Request cancellation" onClick={() => openRequest(s, "cancel")}><Ban className="w-3.5 h-3.5 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {(requests as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">My Change Requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(requests as any[]).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border/20 bg-secondary/10 text-sm">
                <div className="min-w-0">
                  <p className="font-medium capitalize">{r.request_type} — {r.schedule.show_title}</p>
                  {r.admin_note && <p className="text-xs text-muted-foreground">Admin note: {r.admin_note}</p>}
                </div>
                <Badge variant="outline" className={`capitalize shrink-0 ${REQUEST_STATUS_STYLE[r.status] || ""}`}>{r.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{mode === "cancel" ? "Request cancellation" : "Request reschedule"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">"{target?.show_title}" — this goes to admin for approval, it won't change immediately.</p>
            {mode === "reschedule" && (
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-[12px]">Day</Label>
                  <Select value={newDay} onValueChange={setNewDay}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-[12px]">Start</Label><Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-9 text-[13px]" /></div>
                <div><Label className="text-[12px]">End</Label><Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-9 text-[13px]" /></div>
              </div>
            )}
            <div><Label className="text-[12px]">Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="text-[13px]" rows={2} /></div>
            <Button onClick={submit} disabled={requestMutation.isPending} className="w-full">{requestMutation.isPending ? "Sending..." : "Send request"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
