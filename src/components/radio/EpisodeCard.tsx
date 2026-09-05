import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pencil, EyeOff, Trash2, Loader2, AlertTriangle, RefreshCw, Radio, Clock, Play, Lock, Link2 } from "lucide-react"
import { formatShowDuration } from "@/components/radio/EpisodePublishDialog"

export interface AdminEpisode {
  id: string
  title: string
  episode_title: string | null
  description: string | null
  cover_image_url: string | null
  master_audio_url: string | null
  stream_audio_url: string | null
  duration_seconds: number | null
  recording_type: string
  status: string
  visibility: string
  recorded_at: string
  publish_at: string | null
  published_at: string | null
  transcode_status: string | null
  transcode_error: string | null
  play_count: number
  rj_stage_name?: string | null
  show_name?: string | null
  station_name?: string | null
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  processing:     { label: "Processing",     className: "bg-sky-500/15 text-sky-400" },
  draft:          { label: "Draft",          className: "bg-muted text-muted-foreground" },
  pending_review: { label: "Pending Review", className: "bg-amber-500/15 text-amber-400" },
  published:      { label: "Published",      className: "bg-emerald-500/15 text-emerald-400" },
  unpublished:    { label: "Unpublished",    className: "bg-destructive/15 text-destructive" },
}

const VISIBILITY_ICON: Record<string, JSX.Element> = {
  premium: <Lock className="w-3 h-3" />,
  unlisted: <Link2 className="w-3 h-3" />,
}

export function EpisodeCard({
  episode,
  onEdit,
  onUnpublish,
  onPublish,
  onDelete,
  onRetryTranscode,
  isPending,
}: {
  episode: AdminEpisode
  onEdit?: () => void
  onUnpublish?: () => void
  onPublish?: () => void
  onDelete?: () => void
  onRetryTranscode?: () => void
  isPending?: boolean
}) {
  const status = STATUS_LABEL[episode.status] ?? { label: episode.status, className: "bg-muted text-muted-foreground" }
  const scheduled = episode.publish_at && new Date(episode.publish_at).getTime() > Date.now()

  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2.5">
      <div className="flex items-start gap-3">
        {episode.cover_image_url ? (
          <img src={episode.cover_image_url} alt="" className="w-12 h-12 rounded object-cover shrink-0 border border-border/40" />
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0"><Radio className="w-5 h-5 text-muted-foreground" /></div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{episode.title}</p>
          {episode.episode_title && <p className="text-xs text-muted-foreground truncate">{episode.episode_title}</p>}
          <p className="text-xs text-muted-foreground">
            {episode.rj_stage_name ? `${episode.rj_stage_name} · ` : ""}
            {new Date(episode.recorded_at).toLocaleDateString()}
            {episode.duration_seconds ? ` · ${formatShowDuration(episode.duration_seconds)}` : ""}
            {episode.show_name ? ` · ${episode.show_name}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="secondary" className={status.className}>{status.label}</Badge>
          <Badge variant="outline" className="text-[10px] gap-1 capitalize">
            {VISIBILITY_ICON[episode.visibility]} {episode.visibility}
          </Badge>
        </div>
      </div>

      {scheduled && (
        <p className="text-xs text-sky-400 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Scheduled for {new Date(episode.publish_at!).toLocaleString()}
        </p>
      )}

      {episode.transcode_status === "processing" || episode.status === "processing" ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Converting the master WAV to a streaming MP3 — this can take a few minutes on a long show.
        </p>
      ) : episode.transcode_status === "failed" ? (
        <p className="text-xs text-destructive flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>Conversion failed{episode.transcode_error ? `: ${episode.transcode_error}` : ""}</span>
        </p>
      ) : episode.stream_audio_url ? (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Play className="w-3 h-3" /> Streaming MP3 — what listeners hear</p>
          <audio controls src={episode.stream_audio_url} className="w-full h-9" preload="none" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="text-xs text-muted-foreground">{episode.play_count} plays</span>
        {episode.master_audio_url && (
          <a
            href={episode.master_audio_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Master WAV (backup)
          </a>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onRetryTranscode && episode.transcode_status === "failed" && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isPending} onClick={onRetryTranscode}>
              <RefreshCw className="w-3 h-3" /> Retry conversion
            </Button>
          )}
          {onEdit && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isPending} onClick={onEdit}>
              <Pencil className="w-3 h-3" /> Edit Details
            </Button>
          )}
          {onPublish && episode.status !== "published" && (
            <Button size="sm" className="h-7 text-xs gap-1" disabled={isPending} onClick={onPublish}>
              <Radio className="w-3 h-3" /> Publish
            </Button>
          )}
          {onUnpublish && episode.status === "published" && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isPending} onClick={onUnpublish}>
              <EyeOff className="w-3 h-3" /> Unpublish
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-destructive"
              disabled={isPending}
              onClick={() => {
                if (window.confirm("Remove this published show and its streaming MP3? The master WAV backup is kept.")) onDelete()
              }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
