import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Upload, EyeOff, Trash2, Loader2 } from "lucide-react"

export interface RecordingCardSession {
  id: string
  show_title: string | null
  description: string | null
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

export function RecordingCard({
  session,
  onApprove,
  onReject,
  onPublish,
  onUnpublish,
  onDelete,
  isPending,
}: {
  session: RecordingCardSession
  onApprove?: () => void
  onReject?: (reason?: string) => void
  onPublish?: () => void
  onUnpublish?: () => void
  onDelete?: () => void
  isPending?: boolean
}) {
  const status = session.recording_status ? STATUS_LABEL[session.recording_status] : null
  const duration = formatDuration(session.recording_duration_seconds)

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

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
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
    </div>
  )
}
