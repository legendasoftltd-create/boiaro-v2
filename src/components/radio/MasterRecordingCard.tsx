import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, Trash2, Loader2, AlertTriangle } from "lucide-react"

export interface MasterRecordingSession {
  id: string
  show_title: string | null
  started_at: string
  rj_stage_name?: string | null
  studio_session: {
    master_recording_url: string | null
    master_recording_status: string | null
    recording_mode: string
  } | null
}

const MODE_LABEL: Record<string, string> = {
  mixed: "Full Mix (mic + music/jingles)",
  voice_only: "Voice Only",
}

export function MasterRecordingCard({
  session,
  onDelete,
  isPending,
}: {
  session: MasterRecordingSession
  onDelete?: () => void
  isPending?: boolean
}) {
  const studio = session.studio_session
  if (!studio) return null
  const status = studio.master_recording_status

  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{session.show_title || "Untitled Show"}</p>
          <p className="text-xs text-muted-foreground">
            {session.rj_stage_name ? `${session.rj_stage_name} · ` : ""}
            {new Date(session.started_at).toLocaleDateString()} · {new Date(session.started_at).toLocaleTimeString()}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 bg-cyan-500/15 text-cyan-400">
          {MODE_LABEL[studio.recording_mode] || studio.recording_mode}
        </Badge>
      </div>

      {status === "completed" && studio.master_recording_url ? (
        <audio controls src={studio.master_recording_url} className="w-full h-9" preload="none" />
      ) : status === "failed" ? (
        <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Master recording failed to save</p>
      ) : (
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Still processing — check back shortly</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {status === "completed" && studio.master_recording_url && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
            <a href={studio.master_recording_url} download target="_blank" rel="noopener noreferrer">
              <Download className="w-3 h-3" /> Download WAV
            </a>
          </Button>
        )}
        {onDelete && (studio.master_recording_url || status) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-destructive ml-auto"
            disabled={isPending}
            onClick={() => {
              if (window.confirm("Delete this master recording permanently? This removes the WAV file and cannot be undone.")) onDelete()
            }}
          >
            <Trash2 className="w-3 h-3" /> Delete
          </Button>
        )}
      </div>
    </div>
  )
}
