import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AudioFileUpload } from "@/components/admin/AudioFileUpload"
import { CheckCircle2, XCircle, Upload, EyeOff, Trash2, Loader2, Pencil, Headphones, Users, BarChart3 } from "lucide-react"
import { trpc } from "@/lib/trpc"

export interface RecordingCardSession {
  id: string
  show_title: string | null
  description: string | null
  cover_image_url?: string | null
  started_at: string
  ended_at: string | null
  recording_url: string | null
  recording_status: string | null
  recording_duration_seconds: number | null
  recording_approved_at: string | null
  rj_stage_name?: string | null
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft — awaiting review", className: "bg-amber-500/15 text-amber-400" },
  rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive" },
  published: { label: "Published", className: "bg-emerald-500/15 text-emerald-400" },
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export interface RecordingDetailsUpdate {
  showTitle?: string
  description?: string | null
  coverImageUrl?: string | null
  recordingUrl?: string
}

export function RecordingCard({
  session,
  onApprove,
  onReject,
  onPublish,
  onUnpublish,
  onDelete,
  onSave,
  isPending,
  isSaving,
  showStats,
}: {
  session: RecordingCardSession
  onApprove?: () => void
  onReject?: (reason?: string) => void
  onPublish?: () => void
  onUnpublish?: () => void
  onDelete?: () => void
  onSave?: (update: RecordingDetailsUpdate) => void
  isPending?: boolean
  isSaving?: boolean
  showStats?: boolean
}) {
  const status = session.recording_status ? STATUS_LABEL[session.recording_status] : null
  const duration = formatDuration(session.recording_duration_seconds)

  const [editOpen, setEditOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState(session.show_title || "")
  const [descDraft, setDescDraft] = useState(session.description || "")
  const [coverDraft, setCoverDraft] = useState(session.cover_image_url || "")
  const [audioDraft, setAudioDraft] = useState(session.recording_url || "")

  const stats = trpc.rj.recordingStats.useQuery(
    { sessionId: session.id },
    { enabled: !!showStats },
  )

  const openEdit = () => {
    setTitleDraft(session.show_title || "")
    setDescDraft(session.description || "")
    setCoverDraft(session.cover_image_url || "")
    setAudioDraft(session.recording_url || "")
    setEditOpen(true)
  }

  const handleSave = () => {
    if (!onSave) return
    onSave({
      showTitle: titleDraft.trim() || undefined,
      description: descDraft.trim() ? descDraft.trim() : null,
      coverImageUrl: coverDraft.trim() ? coverDraft.trim() : null,
      ...(audioDraft.trim() && audioDraft.trim() !== session.recording_url ? { recordingUrl: audioDraft.trim() } : {}),
    })
    setEditOpen(false)
  }

  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{session.show_title || "Untitled Show"}</p>
          <p className="text-xs text-muted-foreground">
            {session.rj_stage_name ? `${session.rj_stage_name} · ` : ""}
            {new Date(session.started_at).toLocaleDateString()} · {new Date(session.started_at).toLocaleTimeString()}
            {duration ? ` · ${duration}` : ""}
          </p>
        </div>
        {status && <Badge variant="secondary" className={`shrink-0 ${status.className}`}>{status.label}</Badge>}
      </div>

      {session.description && <p className="text-xs text-muted-foreground">{session.description}</p>}

      {session.recording_url ? (
        <audio controls src={session.recording_url} className="w-full h-9" preload="none" />
      ) : (
        <p className="text-xs text-muted-foreground italic">No audio file</p>
      )}

      {showStats && stats.data && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Headphones className="w-3 h-3" /> {stats.data.totalPlays} plays</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {stats.data.uniqueListeners} listeners</span>
          <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {stats.data.completionRatePct}% completed</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {onSave && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openEdit} disabled={isPending}>
            <Pencil className="w-3 h-3" /> Edit
          </Button>
        )}
        {onApprove && session.recording_status === "draft" && !session.recording_approved_at && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onApprove} disabled={isPending}>
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
          </Button>
        )}
        {onReject && session.recording_status !== "rejected" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 text-destructive"
            disabled={isPending}
            onClick={() => onReject(window.prompt("Reason for rejecting this recording (optional):") || undefined)}
          >
            <XCircle className="w-3 h-3" /> Reject
          </Button>
        )}
        {onPublish && session.recording_status !== "published" && session.recording_url && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={onPublish} disabled={isPending}>
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Publish
          </Button>
        )}
        {onUnpublish && session.recording_status === "published" && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onUnpublish} disabled={isPending}>
            <EyeOff className="w-3 h-3" /> Unpublish
          </Button>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-destructive ml-auto"
            disabled={isPending}
            onClick={() => {
              if (window.confirm("Delete this recording permanently? This removes the audio file and cannot be undone.")) onDelete()
            }}
          >
            <Trash2 className="w-3 h-3" /> Delete
          </Button>
        )}
      </div>

      {onSave && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit recording details</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Show title</label>
                <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} maxLength={2000} rows={3} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Cover image URL</label>
                <Input value={coverDraft} onChange={(e) => setCoverDraft(e.target.value)} placeholder="https://…" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Audio file</label>
                <AudioFileUpload
                  value={audioDraft}
                  onChange={setAudioDraft}
                  fieldKey={`recording-edit-${session.id}`}
                  placeholder="Upload a replacement file or paste a URL"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={isSaving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving || !titleDraft.trim()}>
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
