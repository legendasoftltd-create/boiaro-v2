import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SiteImageUpload } from "@/components/admin/SiteImageUpload"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Loader2, Radio } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

export interface PublishSource {
  /** LiveSession id of the source broadcast. Required when creating. */
  sessionId?: string
  /** Set when re-opening the form for an episode that already exists. */
  episodeId?: string
  showTitle: string | null
  episodeTitle?: string | null
  description?: string | null
  coverImageUrl?: string | null
  rjUserId: string
  rjStageName?: string | null
  recordedAt: string
  durationSeconds?: number | null
  /** mixed | voice_only, taken from the Studio session's recording mode. */
  recordingType: string
  masterAudioUrl?: string | null
  showScheduleId?: string | null
  visibility?: string
  publishAt?: string | null
}

const RECORDING_TYPE_LABEL: Record<string, string> = {
  mixed: "Full Mix (mic + music/jingles)",
  voice_only: "Voice Only (mic only)",
}

/** Formats seconds as the app displays them — "1h 18m" / "42m". */
export function formatShowDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "—"
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return m > 0 ? `${m}m` : `${seconds}s`
}

/** <input type="datetime-local"> wants local wall-clock with no zone suffix. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EpisodePublishDialog({
  source,
  open,
  onOpenChange,
  onPublished,
}: {
  source: PublishSource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublished?: () => void
}) {
  const { data: showOptions = [] } = trpc.admin.listOnAirShowOptions.useQuery(undefined, { enabled: open })

  const [title, setTitle] = useState("")
  const [episodeTitle, setEpisodeTitle] = useState("")
  const [description, setDescription] = useState("")
  const [coverImageUrl, setCoverImageUrl] = useState("")
  const [showScheduleId, setShowScheduleId] = useState<string>("none")
  const [recordedAt, setRecordedAt] = useState("")
  const [visibility, setVisibility] = useState("public")
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now")
  const [publishAt, setPublishAt] = useState("")
  const [allowVoiceOnly, setAllowVoiceOnly] = useState(false)

  // Reset every time a different recording is opened — otherwise the previous
  // show's title/cover would carry over into the next publish.
  useEffect(() => {
    if (!source || !open) return
    setTitle(source.showTitle ?? "")
    setEpisodeTitle(source.episodeTitle ?? "")
    setDescription(source.description ?? "")
    setCoverImageUrl(source.coverImageUrl ?? "")
    setShowScheduleId(source.showScheduleId ?? "none")
    setRecordedAt(toLocalInput(source.recordedAt))
    setVisibility(source.visibility ?? "public")
    const futureSchedule = !!source.publishAt && new Date(source.publishAt).getTime() > Date.now()
    setScheduleMode(futureSchedule ? "later" : "now")
    setPublishAt(futureSchedule ? toLocalInput(source.publishAt) : "")
    setAllowVoiceOnly(false)
  }, [source, open])

  // Requirement 2 — "Show-এর existing cover থাকলে defaultভাবে সেই cover
  // auto-select হবে": picking a programme fills in its cover, unless the admin
  // has already chosen a custom episode cover.
  const selectedShow = useMemo(
    () => (showScheduleId === "none" ? null : (showOptions as any[]).find((s) => s.id === showScheduleId) ?? null),
    [showScheduleId, showOptions]
  )
  useEffect(() => {
    if (selectedShow?.cover_image_url && !coverImageUrl) setCoverImageUrl(selectedShow.cover_image_url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShow])

  const utils = trpc.useUtils()
  const publishMutation = trpc.admin.publishOnAirEpisode.useMutation({
    onSuccess: (episode: any) => {
      utils.admin.listOnAirEpisodes.invalidate()
      utils.admin.listOnAirRecordingCandidates.invalidate()
      onOpenChange(false)
      onPublished?.()
      toast.success(
        episode.status === "processing"
          ? "Saved — converting the WAV to a streaming MP3. It goes live as soon as that finishes."
          : episode.status === "published"
          ? "Published — now in the app's Latest Shows"
          : "Saved"
      )
    },
    onError: (e) => toast.error(e.message),
  })

  const isVoiceOnly = source?.recordingType === "voice_only"
  const canSubmit = !!source && title.trim().length > 0 && (scheduleMode === "now" || !!publishAt)

  const submit = (action: "draft" | "review" | "publish") => {
    if (!source) return
    if (action === "publish" && isVoiceOnly && !allowVoiceOnly) {
      toast.error("This is a Voice Only recording — tick the confirmation below to publish it anyway.")
      return
    }
    publishMutation.mutate({
      episodeId: source.episodeId,
      sessionId: source.sessionId,
      action,
      title: title.trim(),
      episodeTitle: episodeTitle.trim() || null,
      description: description.trim() || null,
      coverImageUrl: coverImageUrl.trim() || null,
      showScheduleId: showScheduleId === "none" ? null : showScheduleId,
      rjUserId: source.rjUserId,
      recordedAt: recordedAt ? new Date(recordedAt).toISOString() : undefined,
      visibility: visibility as "public" | "premium" | "unlisted",
      publishAt: action === "publish" && scheduleMode === "later" && publishAt ? new Date(publishAt).toISOString() : null,
      allowVoiceOnly,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{source?.episodeId ? "Edit Published Show" : "Publish Recorded Show"}</DialogTitle>
          <DialogDescription>
            Releases this recording to the app's On Air → Latest Shows. The Studio WAV stays as the master backup —
            a streaming MP3 is generated for listeners.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Show Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="রাতও কথা বলে" />
            </div>
            <div className="space-y-1.5">
              <Label>Episode Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={episodeTitle} onChange={(e) => setEpisodeTitle(e.target.value)} placeholder="পর্ব ১২ — শীতের রাত" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>RJ</Label>
              <Input value={source?.rjStageName ?? "—"} readOnly className="bg-muted/40" />
            </div>
            <div className="space-y-1.5">
              <Label>Show / Program</Label>
              <Select value={showScheduleId} onValueChange={setShowScheduleId}>
                <SelectTrigger><SelectValue placeholder="Not part of a programme" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not part of a programme</SelectItem>
                  {(showOptions as any[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.show_title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cover Image</Label>
            <SiteImageUpload value={coverImageUrl} onChange={setCoverImageUrl} fieldKey="onair-episode-cover" />
            <p className="text-xs text-muted-foreground">
              Leave empty to fall back to the programme's cover, then the station artwork.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="এই পর্বে যা ছিল…" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Recorded Date</Label>
              <Input type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Input value={formatShowDuration(source?.durationSeconds)} readOnly className="bg-muted/40" />
              <p className="text-[11px] text-muted-foreground">Measured from the encoded file</p>
            </div>
            <div className="space-y-1.5">
              <Label>Recording Type</Label>
              <div className="flex h-10 items-center">
                <Badge variant="secondary" className={isVoiceOnly ? "bg-amber-500/15 text-amber-400" : "bg-cyan-500/15 text-cyan-400"}>
                  {RECORDING_TYPE_LABEL[source?.recordingType ?? "mixed"] ?? source?.recordingType}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Audio File</Label>
            {source?.masterAudioUrl ? (
              <audio controls src={source.masterAudioUrl} className="w-full h-9" preload="none" />
            ) : (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> No master recording on this session — nothing to publish.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Master WAV, kept as the backup. Publishing generates a 128 kbps MP3 for the app — the WAV is never streamed.
            </p>
          </div>

          {isVoiceOnly && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs text-amber-500 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                This is a <strong>Voice Only</strong> recording — the host's mic without music or jingles. Full Mix is
                the intended publish source; Voice Only is for internal editing and mastering.
              </p>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={allowVoiceOnly} onCheckedChange={(v) => setAllowVoiceOnly(!!v)} />
                Publish this Voice Only recording anyway
              </label>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — anyone can listen</SelectItem>
                  <SelectItem value="premium">Premium — subscribers only</SelectItem>
                  <SelectItem value="unlisted">Unlisted — link only, hidden from lists</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Publish</Label>
              <Select value={scheduleMode} onValueChange={(v) => setScheduleMode(v as "now" | "later")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Publish Now</SelectItem>
                  <SelectItem value="later">Schedule Publish</SelectItem>
                </SelectContent>
              </Select>
              {scheduleMode === "later" && (
                <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="mt-1.5" />
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => submit("draft")} disabled={!canSubmit || publishMutation.isPending}>
            Save as Draft
          </Button>
          <Button variant="outline" onClick={() => submit("review")} disabled={!canSubmit || publishMutation.isPending}>
            Mark Pending Review
          </Button>
          <Button onClick={() => submit("publish")} disabled={!canSubmit || publishMutation.isPending || !source?.masterAudioUrl}>
            {publishMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Radio className="w-4 h-4 mr-1.5" />}
            {scheduleMode === "later" ? "Schedule Publish" : "Publish Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
