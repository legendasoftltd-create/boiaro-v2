import { useState, useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Radio, Save, Loader2, AlertTriangle, CheckCircle2, Antenna, Plus, Pencil, Rss } from "lucide-react"
import { toast } from "sonner"
import { useSiteSettings } from "@/hooks/useSiteSettings"
import { SiteImageUpload } from "@/components/admin/SiteImageUpload"

const BROADCAST_SETTING_KEYS = [
  "radio_broadcast_host",
  "radio_broadcast_port",
  "radio_broadcast_mount",
  "radio_public_stream_url",
] as const

function BroadcastSetupCard() {
  const { get, isLoading, refetch } = useSiteSettings()
  const updateMutation = trpc.admin.updateSiteSetting.useMutation()
  const [saving, setSaving] = useState<string | null>(null)
  const [form, setForm] = useState({
    radio_broadcast_host: "",
    radio_broadcast_port: "",
    radio_broadcast_mount: "",
    radio_public_stream_url: "",
  })

  useEffect(() => {
    if (isLoading) return
    setForm({
      radio_broadcast_host: get("radio_broadcast_host"),
      radio_broadcast_port: get("radio_broadcast_port"),
      radio_broadcast_mount: get("radio_broadcast_mount"),
      radio_public_stream_url: get("radio_public_stream_url"),
    })
  }, [isLoading])

  const handleSaveField = async (key: (typeof BROADCAST_SETTING_KEYS)[number]) => {
    setSaving(key)
    try {
      await updateMutation.mutateAsync({ key, value: form[key].trim() })
      await refetch()
      toast.success("Saved")
    } catch (e: any) {
      toast.error("Failed to save: " + (e.message || "unknown error"))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Antenna className="w-5 h-5 text-red-400" />
          Default Broadcast Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Fallback Icecast connection details for an RJ who hasn't been pointed at a specific station yet
          (e.g. an ad-hoc test broadcast). Once a station is selected in the Go Live form, that station's own
          Stream URL below is what's actually used — this is only the default shown before one is picked.
          The Icecast source password is NOT stored here — hand it out to approved RJs yourself, out of band.
        </p>
        {([
          ["radio_broadcast_host", "Icecast Host"],
          ["radio_broadcast_port", "Icecast Port"],
          ["radio_broadcast_mount", "Mount Point"],
          ["radio_public_stream_url", "Public Listener Stream URL"],
        ] as const).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label>{label}</Label>
            <div className="flex gap-2">
              <Input
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSaveField(key)}
                disabled={saving === key}
              >
                {saving === key ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

interface RadioStation {
  id: string
  name: string
  stream_url: string
  stream_url_medium?: string | null
  stream_url_low?: string | null
  artwork_url: string | null
  description: string | null
  is_active: boolean
  sort_order: number
  auto_recording_enabled: boolean
}

function validateStreamUrl(url: string): { valid: boolean; warning?: string } {
  if (!url.trim()) return { valid: false, warning: "Stream URL is required" }

  try {
    const parsed = new URL(url.trim())
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, warning: "URL must start with http:// or https://" }
    }

    const ext = parsed.pathname.toLowerCase()
    const supportedExts = [".mp3", ".aac", ".ogg", ".m3u8", ".pls", ".m4a"]
    const looksLikeStream = supportedExts.some(e => ext.includes(e)) ||
                           ext.includes("/stream") || ext.includes("/live") ||
                           parsed.searchParams.has("stream") ||
                           parsed.hostname.includes("stream") ||
                           parsed.hostname.includes("radio") ||
                           parsed.hostname.includes("icecast") ||
                           parsed.hostname.includes("shoutcast")

    if (!looksLikeStream) {
      return { valid: true, warning: "This URL might not be a valid audio stream. Supported formats: MP3, AAC, OGG, HLS (m3u8)" }
    }

    return { valid: true }
  } catch {
    return { valid: false, warning: "Invalid URL format" }
  }
}

const EMPTY_FORM = {
  name: "",
  stream_url: "",
  stream_url_medium: "",
  stream_url_low: "",
  artwork_url: "",
  description: "",
  is_active: true,
  auto_recording_enabled: false,
}

/** Create (station === null) or edit (station set) — same form either way. */
function StationFormDialog({ station, onClose, onSaved }: { station: RadioStation | null; onClose: () => void; onSaved: () => void }) {
  const upsertRadioStationMutation = trpc.admin.upsertRadioStation.useMutation()
  const [saving, setSaving] = useState(false)
  const [urlValidation, setUrlValidation] = useState<{ valid: boolean; warning?: string }>({ valid: true })
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    setForm(station ? {
      name: station.name,
      stream_url: station.stream_url,
      stream_url_medium: station.stream_url_medium || "",
      stream_url_low: station.stream_url_low || "",
      artwork_url: station.artwork_url || "",
      description: station.description || "",
      is_active: station.is_active,
      auto_recording_enabled: station.auto_recording_enabled ?? false,
    } : EMPTY_FORM)
  }, [station])

  useEffect(() => {
    setUrlValidation(form.stream_url ? validateStreamUrl(form.stream_url) : { valid: true })
  }, [form.stream_url])

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Station name is required"); return }
    if (!form.stream_url.trim()) { toast.error("Stream URL is required"); return }

    const validation = validateStreamUrl(form.stream_url)
    if (!validation.valid) {
      toast.error(validation.warning || "Invalid stream URL")
      return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      stream_url: form.stream_url.trim(),
      stream_url_medium: form.stream_url_medium.trim() || null,
      stream_url_low: form.stream_url_low.trim() || null,
      artwork_url: form.artwork_url.trim() || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
      auto_recording_enabled: form.auto_recording_enabled,
    }

    try {
      await upsertRadioStationMutation.mutateAsync({
        ...(station ? { id: station.id } : {}),
        ...payload,
        sort_order: station?.sort_order ?? 0,
      } as any)
      toast.success(station ? "Station updated" : "Station created")
      onSaved()
    } catch (e: any) {
      toast.error("Failed to save: " + (e.message || "unknown error"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-400" />
            {station ? `Edit "${station.name}"` : "Add Station"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
            <div>
              <Label className="text-base font-medium">Station Active</Label>
              <p className="text-sm text-muted-foreground">
                {form.is_active ? "Visible on the website — users can listen live" : "Hidden from the website"}
              </p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </div>

          <div className="space-y-2">
            <Label>Station Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="BoiAro Radio"
            />
          </div>

          <div className="space-y-2">
            <Label>Stream URL *</Label>
            <Input
              value={form.stream_url}
              onChange={(e) => setForm((f) => ({ ...f, stream_url: e.target.value }))}
              placeholder="https://stream.example.com/live.mp3"
              className={urlValidation.warning && !urlValidation.valid ? "border-destructive" : ""}
            />
            {urlValidation.warning ? (
              <p className={`text-xs flex items-center gap-1 ${urlValidation.valid ? "text-amber-400" : "text-destructive"}`}>
                <AlertTriangle className="w-3 h-3" />
                {urlValidation.warning}
              </p>
            ) : form.stream_url.trim() && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Stream URL looks valid
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Supports MP3, AAC, OGG, Icecast, Shoutcast, HLS (.m3u8) streams — HLS streams are automatically demuxed via hls.js for browsers without native HLS support. Audio loads only when user clicks play.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Medium-Quality Stream URL (optional)</Label>
              <Input
                value={form.stream_url_medium}
                onChange={(e) => setForm((f) => ({ ...f, stream_url_medium: e.target.value }))}
                placeholder="https://stream.example.com/live-64k.mp3"
              />
            </div>
            <div className="space-y-2">
              <Label>Low-Quality Stream URL (optional)</Label>
              <Input
                value={form.stream_url_low}
                onChange={(e) => setForm((f) => ({ ...f, stream_url_low: e.target.value }))}
                placeholder="https://stream.example.com/live-32k.mp3"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Only fill these in if this station's Icecast/Shoutcast server actually runs separate lower-bitrate mount points — this app can't transcode a single stream into multiple qualities on its own. Leave blank and listeners just get the main stream, no quality selector shown.
          </p>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>Auto-record RJ live sessions on this station</Label>
              <p className="text-xs text-muted-foreground">
                Also requires the global "Automatic Recording" toggle in Radio Safety &amp; Controls to be on.
              </p>
            </div>
            <Switch
              checked={form.auto_recording_enabled}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, auto_recording_enabled: checked }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Artwork</Label>
            <SiteImageUpload
              value={form.artwork_url}
              onChange={(url) => setForm((f) => ({ ...f, artwork_url: url }))}
              fieldKey="station-artwork"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="24/7 Bengali literature, stories, and poetry..."
              rows={3}
            />
          </div>

          {form.stream_url.trim() && (
            <div className="space-y-2">
              <Label>Test Stream</Label>
              <audio controls src={form.stream_url} className="w-full" preload="none" />
              <p className="text-xs text-muted-foreground">
                Click play above to test the stream. If it doesn't work here, it won't work on the website either.
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || (!urlValidation.valid && !!form.stream_url)}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {station ? "Update Station" : "Create Station"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminRadio() {
  const utils = trpc.useUtils()
  const setRadioStationActiveMutation = trpc.admin.setRadioStationActive.useMutation()
  const [stations, setStations] = useState<RadioStation[]>([])
  const [loading, setLoading] = useState(true)
  // null = dialog closed, "new" = create flow, a station = edit flow
  const [dialogTarget, setDialogTarget] = useState<RadioStation | "new" | null>(null)

  useEffect(() => {
    loadStations()
  }, [])

  const loadStations = async () => {
    setLoading(true)
    // staleTime: 0 forces a fresh fetch — this also runs right after a
    // create/update/toggle, so cached (pre-change) data would otherwise be
    // served until the global 30s staleTime expires.
    const rows = await utils.admin.listRadioStations.fetch(undefined, { staleTime: 0 })
    setStations((rows || []) as RadioStation[])
    setLoading(false)
  }

  const handleToggleActive = async (s: RadioStation, active: boolean) => {
    // Optimistic UI, reverted on failure — same pattern as the old single-station toggle.
    setStations((rows) => rows.map((r) => (r.id === s.id ? { ...r, is_active: active } : r)))
    try {
      await setRadioStationActiveMutation.mutateAsync({ id: s.id, is_active: active })
      toast.success(active ? `"${s.name}" is now visible on the website` : `"${s.name}" is now hidden`)
    } catch (e: any) {
      setStations((rows) => rows.map((r) => (r.id === s.id ? { ...r, is_active: !active } : r)))
      toast.error("Failed to toggle: " + (e.message || "unknown error"))
    }
  }

  const activeCount = stations.filter((s) => s.is_active).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BoiAro On Air</h1>
          <p className="text-muted-foreground text-sm">Manage stations for BoiAro On Air — each one broadcasts independently</p>
        </div>
        {stations.length > 0 && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            activeCount > 0
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-muted text-muted-foreground border border-border"
          }`}>
            <span className={`w-2 h-2 rounded-full ${activeCount > 0 ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
            {activeCount} / {stations.length} station{stations.length === 1 ? "" : "s"} visible
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Rss className="w-5 h-5 text-red-400" />
            Stations
          </CardTitle>
          <Button size="sm" onClick={() => setDialogTarget("new")} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Station
          </Button>
        </CardHeader>
        <CardContent>
          {stations.length === 0 ? (
            <div className="text-center py-10">
              <Radio className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-4">No stations yet — add one to turn on BoiAro On Air.</p>
              <Button onClick={() => setDialogTarget("new")} className="gap-1.5">
                <Plus className="w-4 h-4" /> Add Station
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {stations.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{s.name}</p>
                      {s.auto_recording_enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">auto-record</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{s.stream_url}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={s.is_active} onCheckedChange={(v) => handleToggleActive(s, v)} />
                    <Button size="icon" variant="ghost" onClick={() => setDialogTarget(s)} title="Edit station">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BroadcastSetupCard />

      {dialogTarget !== null && (
        <StationFormDialog
          station={dialogTarget === "new" ? null : dialogTarget}
          onClose={() => setDialogTarget(null)}
          onSaved={() => { setDialogTarget(null); loadStations() }}
        />
      )}
    </div>
  )
}
