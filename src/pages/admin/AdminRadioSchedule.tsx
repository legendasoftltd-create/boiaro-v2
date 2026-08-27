import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Calendar, Plus, Edit, Trash2, Clock, Inbox, Check, X } from "lucide-react"
import { toast } from "sonner"
import { SiteImageUpload } from "@/components/admin/SiteImageUpload"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const STATUS_STYLE: Record<string, string> = {
  active: "text-emerald-500 border-emerald-500/30",
  cancelled: "text-destructive border-destructive/30",
  rescheduled: "text-amber-500 border-amber-500/30",
}

function ScheduleChangeRequests() {
  const utils = trpc.useUtils()
  const { data: requests = [], isLoading } = trpc.admin.listScheduleChangeRequests.useQuery({ status: "pending" })
  const reviewMutation = trpc.admin.reviewScheduleChangeRequest.useMutation({
    onSuccess: () => { utils.admin.listScheduleChangeRequests.invalidate(); utils.admin.listShowSchedules.invalidate(); toast.success("Reviewed") },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return null
  if (requests.length === 0) return null

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Inbox className="w-4 h-4" /> Pending RJ change requests ({requests.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {(requests as any[]).map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 bg-secondary/10">
            <Badge variant="outline" className="capitalize shrink-0">{r.request_type}</Badge>
            <div className="flex-1 min-w-0 text-[13px]">
              <p className="font-medium">{r.schedule.show_title} <span className="text-muted-foreground font-normal">by {r.rj_stage_name}</span></p>
              {r.request_type === "reschedule" && (
                <p className="text-[11px] text-muted-foreground">
                  New: {r.proposed_specific_date ? new Date(r.proposed_specific_date).toLocaleDateString(undefined, { timeZone: "Asia/Dhaka" }) : (r.proposed_day_of_week != null ? DAY_NAMES[r.proposed_day_of_week] : r.schedule.day_of_week != null ? DAY_NAMES[r.schedule.day_of_week] : "")}{" "}
                  {r.proposed_start_time ?? r.schedule.start_time}-{r.proposed_end_time ?? r.schedule.end_time}
                </p>
              )}
              {r.reason && <p className="text-[11px] text-muted-foreground">Reason: {r.reason}</p>}
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, decision: "approve" })}><Check className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: r.id, decision: "reject" })}><X className="w-4 h-4" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function AdminRadioSchedule() {
  const utils = trpc.useUtils()
  const { data: schedules = [], isLoading } = trpc.admin.listShowSchedules.useQuery()
  const { data: stations = [] } = trpc.admin.listRadioStations.useQuery()
  const { data: rjProfiles = [] } = trpc.admin.listRjProfiles.useQuery()

  const saveMutation = trpc.admin.upsertShowSchedule.useMutation({
    onSuccess: () => { utils.admin.listShowSchedules.invalidate(); toast.success("Schedule saved"); setOpen(false) },
    onError: (e) => toast.error(e.message),
  })
  const deleteMutation = trpc.admin.deleteShowSchedule.useMutation({
    onSuccess: () => { utils.admin.listShowSchedules.invalidate(); toast.success("Schedule removed") },
  })

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    station_id: "", rj_user_id: "", show_title: "", schedule_type: "recurring" as "recurring" | "one_time",
    day_of_week: "0", specific_date: "", end_date: "", start_time: "18:00", end_time: "19:00",
    category: "", description: "", cover_image_url: "", status: "active" as "active" | "cancelled" | "rescheduled",
  })

  const approvedRjs = (rjProfiles as any[]).filter((r) => r.is_approved)

  const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m }
  const addDays = (dateStr: string, days: number) => {
    const d = new Date(`${dateStr}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  // Auto-suggests End Date whenever Start Date/Start Time/End Time change —
  // same day if the show doesn't cross midnight, Start Date + 1 if it does —
  // but never overwrites an End Date the admin already picked past Start
  // Date (a deliberately longer gap for a special multi-day event).
  const updateTiming = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch }
    if (next.schedule_type === "one_time" && next.specific_date && next.start_time && next.end_time) {
      const crosses = toMinutes(next.end_time) <= toMinutes(next.start_time)
      if (crosses) {
        if (!next.end_date || next.end_date <= next.specific_date) next.end_date = addDays(next.specific_date, 1)
      } else {
        next.end_date = next.specific_date
      }
    }
    setForm(next)
  }

  const openNew = () => {
    setEditId(null)
    setForm({
      station_id: (stations as any[])[0]?.id || "", rj_user_id: approvedRjs[0]?.user_id || "", show_title: "",
      schedule_type: "recurring", day_of_week: "0", specific_date: "", end_date: "", start_time: "18:00", end_time: "19:00",
      category: "", description: "", cover_image_url: "", status: "active",
    })
    setOpen(true)
  }

  const openEdit = (s: any) => {
    setEditId(s.id)
    setForm({
      station_id: s.station_id, rj_user_id: s.rj_user_id, show_title: s.show_title,
      schedule_type: s.schedule_type || "recurring", day_of_week: String(s.day_of_week),
      specific_date: s.specific_date ? String(s.specific_date).slice(0, 10) : "",
      end_date: s.end_date ? String(s.end_date).slice(0, 10) : (s.specific_date ? String(s.specific_date).slice(0, 10) : ""),
      start_time: s.start_time, end_time: s.end_time,
      category: s.category || "", description: s.description || "", cover_image_url: s.cover_image_url || "", status: s.status || "active",
    })
    setOpen(true)
  }

  const save = () => {
    if (!form.station_id || !form.rj_user_id || !form.show_title.trim()) {
      toast.error("Fill in station, RJ, and show title")
      return
    }
    if (form.schedule_type === "one_time" && !form.specific_date) {
      toast.error("Pick a start date for a one-time show")
      return
    }
    const crossesMidnight = form.schedule_type === "one_time" && toMinutes(form.end_time) <= toMinutes(form.start_time)
    if (crossesMidnight && !form.end_date) {
      toast.error("Pick an end date — this show's end time is before its start time, so it ends the next day")
      return
    }
    saveMutation.mutate({
      id: editId || undefined,
      station_id: form.station_id,
      rj_user_id: form.rj_user_id,
      show_title: form.show_title,
      schedule_type: form.schedule_type,
      // getUTCDay(), not getDay() — specific_date is constructed below as UTC
      // midnight of the picked calendar date; reading it back with the local
      // getDay() can land on the wrong weekday for anyone west of UTC.
      day_of_week: form.schedule_type === "one_time" ? new Date(`${form.specific_date}T00:00:00.000Z`).getUTCDay() : Number(form.day_of_week),
      specific_date: form.schedule_type === "one_time" ? new Date(`${form.specific_date}T00:00:00.000Z`).toISOString() : undefined,
      end_date: crossesMidnight ? new Date(`${form.end_date}T00:00:00.000Z`).toISOString() : undefined,
      start_time: form.start_time,
      end_time: form.end_time,
      is_active: form.status !== "cancelled",
      status: form.status,
      category: form.category || undefined,
      description: form.description || undefined,
      cover_image_url: form.cover_image_url || undefined,
    })
  }

  if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Show Schedule</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Show</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Edit Show" : "New Show"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-[12px]">Show Title</Label><Input value={form.show_title} onChange={(e) => setForm({ ...form, show_title: e.target.value })} className="h-9 text-[13px]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Station</Label>
                  <Select value={form.station_id} onValueChange={(v) => setForm({ ...form, station_id: v })}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{(stations as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-[12px]">RJ / Host</Label>
                  <Select value={form.rj_user_id} onValueChange={(v) => setForm({ ...form, rj_user_id: v })}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{approvedRjs.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.stage_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Type</Label>
                  <Select value={form.schedule_type} onValueChange={(v) => setForm({ ...form, schedule_type: v as any })}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring">Recurring (weekly)</SelectItem>
                      <SelectItem value="one_time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-[12px]">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="rescheduled">Rescheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.schedule_type === "recurring" ? (
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-[12px]">Day</Label>
                    <Select value={form.day_of_week} onValueChange={(v) => setForm({ ...form, day_of_week: v })}>
                      <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[12px]">Start</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="h-9 text-[13px]" /></div>
                  <div><Label className="text-[12px]">End</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="h-9 text-[13px]" /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[12px]">Start Date</Label><Input type="date" value={form.specific_date} onChange={(e) => updateTiming({ specific_date: e.target.value })} className="h-9 text-[13px]" /></div>
                  <div><Label className="text-[12px]">Start Time</Label><Input type="time" value={form.start_time} onChange={(e) => updateTiming({ start_time: e.target.value })} className="h-9 text-[13px]" /></div>
                  <div><Label className="text-[12px]">End Date</Label><Input type="date" value={form.end_date} min={form.specific_date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="h-9 text-[13px]" /></div>
                  <div><Label className="text-[12px]">End Time</Label><Input type="time" value={form.end_time} onChange={(e) => updateTiming({ end_time: e.target.value })} className="h-9 text-[13px]" /></div>
                  {toMinutes(form.end_time) <= toMinutes(form.start_time) && (
                    <p className="col-span-2 text-[11px] text-amber-500">শো মধ্যরাত পার করে যাচ্ছে — End Date পরের দিন সেট করা হয়েছে, প্রয়োজনে বদলে দিন।</p>
                  )}
                </div>
              )}
              <div><Label className="text-[12px]">Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Music, Talk, News..." className="h-9 text-[13px]" /></div>
              <div><Label className="text-[12px]">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's this show about?" rows={2} className="text-[13px]" /></div>
              <div>
                <Label className="text-[12px]">Cover Image</Label>
                <SiteImageUpload
                  value={form.cover_image_url}
                  onChange={(url) => setForm({ ...form, cover_image_url: url })}
                  fieldKey="show-cover"
                />
              </div>
              <Button onClick={save} disabled={saveMutation.isPending} className="w-full">{saveMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScheduleChangeRequests />

      <div className="space-y-2">
        {schedules.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-10">No shows scheduled yet.</p>
        ) : (
          (schedules as any[]).map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 bg-secondary/10">
              <Badge variant="outline" className="w-24 justify-center shrink-0">
                {s.schedule_type === "one_time" && s.specific_date ? new Date(s.specific_date).toLocaleDateString(undefined, { timeZone: "Asia/Dhaka" }) : DAY_NAMES[s.day_of_week].slice(0, 3)}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium">{s.show_title}</p>
                <p className="text-[11px] text-muted-foreground">{s.rj_stage_name || "Unassigned"} · {s.station?.name}{s.category ? ` · ${s.category}` : ""}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 capitalize ${STATUS_STYLE[s.status] || ""}`}>{s.status}</Badge>
              <Badge variant="outline" className="gap-1 shrink-0">
                <Clock className="w-3 h-3" /> {s.start_time}-{s.end_time}
                {s.end_date && s.specific_date && String(s.end_date).slice(0, 10) !== String(s.specific_date).slice(0, 10) && (
                  <span className="text-muted-foreground">(+1d)</span>
                )}
              </Badge>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Delete this show?")) deleteMutation.mutate({ id: s.id }) }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
