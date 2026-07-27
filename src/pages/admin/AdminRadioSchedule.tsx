import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Calendar, Plus, Edit, Trash2, Clock } from "lucide-react"
import { toast } from "sonner"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

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
    station_id: "", rj_user_id: "", show_title: "", day_of_week: "0", start_time: "18:00", end_time: "19:00",
  })

  const approvedRjs = (rjProfiles as any[]).filter((r) => r.is_approved)

  const openNew = () => {
    setEditId(null)
    setForm({ station_id: (stations as any[])[0]?.id || "", rj_user_id: approvedRjs[0]?.user_id || "", show_title: "", day_of_week: "0", start_time: "18:00", end_time: "19:00" })
    setOpen(true)
  }

  const openEdit = (s: any) => {
    setEditId(s.id)
    setForm({ station_id: s.station_id, rj_user_id: s.rj_user_id, show_title: s.show_title, day_of_week: String(s.day_of_week), start_time: s.start_time, end_time: s.end_time })
    setOpen(true)
  }

  const save = () => {
    if (!form.station_id || !form.rj_user_id || !form.show_title.trim()) {
      toast.error("Fill in station, RJ, and show title")
      return
    }
    saveMutation.mutate({
      id: editId || undefined,
      station_id: form.station_id,
      rj_user_id: form.rj_user_id,
      show_title: form.show_title,
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
      is_active: true,
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
              <Button onClick={save} disabled={saveMutation.isPending} className="w-full">{saveMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {schedules.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-10">No shows scheduled yet.</p>
        ) : (
          (schedules as any[]).map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 bg-secondary/10">
              <Badge variant="outline" className="w-20 justify-center shrink-0">{DAY_NAMES[s.day_of_week].slice(0, 3)}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium">{s.show_title}</p>
                <p className="text-[11px] text-muted-foreground">{s.rj_stage_name || "Unassigned"} · {s.station?.name}</p>
              </div>
              <Badge variant="outline" className="gap-1 shrink-0"><Clock className="w-3 h-3" /> {s.start_time}-{s.end_time}</Badge>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Delete this show?")) deleteMutation.mutate({ id: s.id }) }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
