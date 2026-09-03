import { useEffect, useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Info } from "lucide-react"
import { toast } from "sonner"

/**
 * Per-show social broadcasting (§12).
 *
 * Auto-start and auto-stop are separate switches from the platform toggles on
 * purpose: a show can be marked for Facebook and YouTube while an admin still
 * wants to press the button themselves.
 */
export function ShowSocialSettingsDialog({
  scheduleId,
  showTitle,
  open,
  onOpenChange,
}: {
  scheduleId: string | null
  showTitle: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const utils = trpc.useUtils()
  const settingsQuery = trpc.admin.showSocialSettings.useQuery(
    { scheduleIds: scheduleId ? [scheduleId] : [] },
    { enabled: Boolean(scheduleId) && open }
  )
  const saveMutation = trpc.admin.saveShowSocialSettings.useMutation()

  const [form, setForm] = useState({
    facebook_enabled: false,
    youtube_enabled: false,
    auto_start: false,
    auto_stop: false,
    start_before_minutes: 5,
    stop_after_minutes: 5,
    social_title: "",
    social_description: "",
  })

  useEffect(() => {
    if (!open) return
    const row = settingsQuery.data?.[0]
    setForm({
      facebook_enabled: row?.facebook_enabled ?? false,
      youtube_enabled: row?.youtube_enabled ?? false,
      auto_start: row?.auto_start ?? false,
      auto_stop: row?.auto_stop ?? false,
      start_before_minutes: row?.start_before_minutes ?? 5,
      stop_after_minutes: row?.stop_after_minutes ?? 5,
      social_title: row?.social_title ?? "",
      social_description: row?.social_description ?? "",
    })
  }, [open, settingsQuery.data])

  const handleSave = async () => {
    if (!scheduleId) return
    try {
      await saveMutation.mutateAsync({
        show_schedule_id: scheduleId,
        ...form,
        social_title: form.social_title.trim() || undefined,
        social_description: form.social_description.trim() || undefined,
      })
      await utils.admin.showSocialSettings.invalidate()
      toast.success("Social settings saved")
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || "Could not save")
    }
  }

  const row = (v: boolean, set: (b: boolean) => void, label: string, hint: string) => (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="pr-3">
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={v} onCheckedChange={set} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Social broadcasting — {showTitle}</DialogTitle>
        </DialogHeader>

        {settingsQuery.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {row(form.facebook_enabled, (v) => setForm((f) => ({ ...f, facebook_enabled: v })), "Facebook Live", "Broadcast this show to the connected Facebook Page.")}
            {row(form.youtube_enabled, (v) => setForm((f) => ({ ...f, youtube_enabled: v })), "YouTube Live", "Broadcast this show to the connected YouTube channel.")}
            {row(form.auto_start, (v) => setForm((f) => ({ ...f, auto_start: v })), "Start automatically", "Begin without anyone pressing a button, once the show is on air.")}
            {row(form.auto_stop, (v) => setForm((f) => ({ ...f, auto_stop: v })), "Stop automatically", "End the social stream after the show finishes.")}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start before (minutes)</Label>
                <Input
                  type="number" min={0} max={60}
                  value={form.start_before_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, start_before_minutes: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Stop after (minutes)</Label>
                <Input
                  type="number" min={0} max={60}
                  value={form.stop_after_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, stop_after_minutes: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Social title <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={form.social_title}
                onChange={(e) => setForm((f) => ({ ...f, social_title: e.target.value }))}
                placeholder="Defaults to the show title"
              />
            </div>
            <div className="space-y-2">
              <Label>Social description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                rows={3}
                value={form.social_description}
                onChange={(e) => setForm((f) => ({ ...f, social_description: e.target.value }))}
              />
            </div>

            <p className="text-xs text-muted-foreground flex gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Automatic start only happens when the show is genuinely on air and a platform connection is
              enabled. If either is missing the run is skipped and tried again a minute later — it never
              starts a broadcast with no audio.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
