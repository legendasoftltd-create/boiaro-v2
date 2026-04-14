import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Radio, Save, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface RadioStation {
  id: string
  name: string
  stream_url: string
  artwork_url: string | null
  description: string | null
  is_active: boolean
  sort_order: number
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

export default function AdminRadio() {
  const [station, setStation] = useState<RadioStation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [urlValidation, setUrlValidation] = useState<{ valid: boolean; warning?: string }>({ valid: true })
  const [form, setForm] = useState({
    name: "",
    stream_url: "",
    artwork_url: "",
    description: "",
    is_active: true,
  })

  useEffect(() => {
    loadStation()
  }, [])

  useEffect(() => {
    if (form.stream_url) {
      setUrlValidation(validateStreamUrl(form.stream_url))
    } else {
      setUrlValidation({ valid: true })
    }
  }, [form.stream_url])

  const loadStation = async () => {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from("radio_stations")
      .select("*")
      .order("sort_order", { ascending: true })
      .limit(2)

    if (error) {
      toast.error("Failed to load station: " + error.message)
      setLoading(false)
      return
    }

    if (rows && rows.length > 1) {
      console.warn("[AdminRadio] Multiple radio_stations rows detected", {
        rowCount: rows.length,
        rowIds: rows.map((r) => r.id),
      })
    }

    const data = rows?.[0]

    if (data) {
      const s = data as RadioStation
      console.info("[AdminRadio] Fresh station fetch", {
        frontendFetchedValue: s.is_active,
        stationId: s.id,
        streamUrl: s.stream_url,
      })
      setStation(s)
      setForm({
        name: s.name,
        stream_url: s.stream_url,
        artwork_url: s.artwork_url || "",
        description: s.description || "",
        is_active: s.is_active,
      })
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Station name is required")
      return
    }
    if (!form.stream_url.trim()) {
      toast.error("Stream URL is required")
      return
    }

    const validation = validateStreamUrl(form.stream_url)
    if (!validation.valid) {
      toast.error(validation.warning || "Invalid stream URL")
      return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      stream_url: form.stream_url.trim(),
      artwork_url: form.artwork_url.trim() || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }

    console.info("[AdminRadio] Save requested", {
      formStateValue: form.is_active,
      mutationPayload: payload,
      stationId: station?.id ?? null,
    })

    let error
    let targetStationId = station?.id ?? null
    if (station) {
      const res = await supabase
        .from("radio_stations")
        .update(payload)
        .eq("id", station.id)
        .select("id")
        .single()
      error = res.error
    } else {
      const res = await supabase
        .from("radio_stations")
        .insert({ ...payload, sort_order: 0 })
        .select("id")
        .single()
      targetStationId = res.data?.id ?? null
      error = res.error
    }

    setSaving(false)
    if (error) {
      toast.error("Failed to save: " + error.message)
    } else {
      if (targetStationId) {
        const { data: saved } = await supabase
          .from("radio_stations")
          .select("*")
          .eq("id", targetStationId)
          .maybeSingle()

        if (saved) {
          const s = saved as RadioStation
          console.info("[AdminRadio] Save verification", {
            databaseSavedValue: s.is_active,
            frontendFetchedValue: s.is_active,
            stationId: s.id,
          })
        }
      }

      toast.success(form.is_active ? "Radio station is now LIVE on your website!" : "Radio station saved (currently OFF)")
      loadStation()
    }
  }

  const handleToggle = async (active: boolean) => {
    setForm(f => ({ ...f, is_active: active }))
    
    // If station exists, immediately save the toggle
    if (station) {
      const payload = { is_active: active, updated_at: new Date().toISOString() }
      console.info("[AdminRadio] Toggle requested", {
        formStateValue: active,
        mutationPayload: payload,
        stationId: station.id,
      })

      const { data: updatedRow, error } = await supabase
        .from("radio_stations")
        .update(payload)
        .eq("id", station.id)
        .select("*")
        .single()
      
      if (error) {
        toast.error("Failed to toggle: " + error.message)
        setForm(f => ({ ...f, is_active: !active }))
      } else {
        const s = updatedRow as RadioStation
        console.info("[AdminRadio] Toggle verification", {
          databaseSavedValue: s.is_active,
          frontendFetchedValue: s.is_active,
          stationId: s.id,
        })

        if (s.is_active !== active) {
          toast.error("Toggle did not persist. Please try again.")
          setForm(f => ({ ...f, is_active: s.is_active }))
          setStation(s)
          return
        }

        setForm(f => ({ ...f, is_active: s.is_active }))
        setStation(s)

        toast.success(active ? "Live Radio is now ON — visible on website" : "Live Radio is now OFF — hidden from website")
      }
    }
  }

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
          <h1 className="text-2xl font-bold text-black">Live Radio</h1>
        </div>
        {station && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            form.is_active 
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" 
              : "bg-muted text-muted-foreground border border-border"
          }`}>
            <span className={`w-2 h-2 rounded-full ${form.is_active ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
            {form.is_active ? "LIVE ON WEBSITE" : "OFF"}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-400" />
            Radio Station Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ON/OFF Toggle — prominent */}
          <div className="flex items-center justify-between p-4 rounded-lg  border border-border">
            <div>
              <Label className="text-base font-medium">Station Active</Label>
              <p className="text-sm text-muted-foreground">
                {form.is_active ? "Radio is visible on the website — users can listen live" : "Radio is hidden from the website"}
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={handleToggle}
            />
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
              Supports MP3, AAC, OGG, Icecast, Shoutcast, HLS streams. Audio loads only when user clicks play.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Artwork URL</Label>
            <Input
              value={form.artwork_url}
              onChange={(e) => setForm((f) => ({ ...f, artwork_url: e.target.value }))}
              placeholder="https://example.com/radio-cover.jpg"
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

          <Button onClick={handleSave} disabled={saving || (!urlValidation.valid && !!form.stream_url)} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {station ? "Update Station" : "Create Station"}
          </Button>
        </CardContent>
      </Card>

      {station && form.stream_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test Stream</CardTitle>
          </CardHeader>
          <CardContent>
            <audio controls src={form.stream_url} className="w-full" preload="none" />
            <p className="text-xs text-muted-foreground mt-2">
              Click play above to test the stream. If it doesn't work here, it won't work on the website either.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
