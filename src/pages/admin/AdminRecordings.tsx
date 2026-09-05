import { useEffect, useMemo, useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RecordingCard } from "@/components/radio/RecordingCard"
import { MasterRecordingCard } from "@/components/radio/MasterRecordingCard"
import { EpisodeCard, type AdminEpisode } from "@/components/radio/EpisodeCard"
import { EpisodePublishDialog, type PublishSource } from "@/components/radio/EpisodePublishDialog"
import { FileAudio, Loader2, Radio, Upload } from "lucide-react"
import { toast } from "sonner"

const EPISODE_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "draft", label: "Draft" },
  { key: "pending_review", label: "Pending Review" },
  { key: "published", label: "Published" },
  { key: "unpublished", label: "Unpublished" },
]

export default function AdminRecordings() {
  const utils = trpc.useUtils()

  useEffect(() => {
    document.title = "Recordings — Admin"
    return () => { document.title = "BoiAro" }
  }, [])

  const { data: pending = [], isLoading: pendingLoading } = trpc.rj.pendingRecordings.useQuery()
  const { data: endedSessions = [], isLoading: publishedLoading } = trpc.admin.listLiveSessions.useQuery({ status: "ended", limit: 100 })
  const { data: rjs = [] } = trpc.admin.listRjProfiles.useQuery()
  const published = endedSessions.filter((s: any) => s.recording_status === "published")

  const nameFor = (rjUserId: string) => rjs.find((r: any) => r.user_id === rjUserId)?.stage_name

  const invalidate = () => {
    utils.rj.pendingRecordings.invalidate()
    utils.admin.listLiveSessions.invalidate()
  }

  const approveMutation = trpc.rj.approveRecording.useMutation({ onSuccess: () => { invalidate(); toast.success("Approved") }, onError: (e) => toast.error(e.message) })
  const rejectMutation = trpc.rj.rejectRecording.useMutation({ onSuccess: () => { invalidate(); toast.success("Rejected") }, onError: (e) => toast.error(e.message) })
  const publishMutation = trpc.rj.publishRecording.useMutation({ onSuccess: () => { invalidate(); toast.success("Published — now live as catch-up audio") }, onError: (e) => toast.error(e.message) })
  const unpublishMutation = trpc.rj.unpublishRecording.useMutation({ onSuccess: () => { invalidate(); toast.success("Unpublished") }, onError: (e) => toast.error(e.message) })
  const deleteMutation = trpc.rj.deleteRecording.useMutation({ onSuccess: () => { invalidate(); toast.success("Deleted") }, onError: (e) => toast.error(e.message) })
  const saveDetailsMutation = trpc.rj.updateRecordingDetails.useMutation({ onSuccess: () => { invalidate(); toast.success("Saved") }, onError: (e) => toast.error(e.message) })
  const deleteMasterMutation = trpc.rj.deleteMasterRecording.useMutation({ onSuccess: () => { utils.admin.listOnAirRecordingCandidates.invalidate(); toast.success("Deleted") }, onError: (e) => toast.error(e.message) })

  const anyPending = approveMutation.isPending || rejectMutation.isPending || publishMutation.isPending || unpublishMutation.isPending || deleteMutation.isPending

  // ── Recorded show publishing ───────────────────────────────────────────────
  const [episodeTab, setEpisodeTab] = useState("all")
  const [publishSource, setPublishSource] = useState<PublishSource | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Anything still converting is polled — the transcode runs in the background
  // on the server, so the card has no other way to learn it finished. React
  // Query v5 hands the callback the Query, not the data.
  const pollWhileConverting = (predicate: (row: any) => boolean) => (query: any) => {
    const rows = query.state.data
    return Array.isArray(rows) && rows.some(predicate) ? 5000 : false
  }
  const isConverting = (e: any) => e.status === "processing" || e.transcode_status === "processing"

  const { data: episodes = [], isLoading: episodesLoading } = trpc.admin.listOnAirEpisodes.useQuery(
    episodeTab === "all" ? undefined : ({ status: episodeTab } as any),
    { refetchInterval: pollWhileConverting(isConverting) }
  )
  // Tab counts have to come from the unfiltered list — deriving them from the
  // filtered one above would blank every other tab's badge on selection. On
  // the "All" tab this is the same query key, so React Query serves both from
  // one request.
  const { data: allEpisodes = [] } = trpc.admin.listOnAirEpisodes.useQuery(undefined)
  const { data: candidates = [], isLoading: candidatesLoading } = trpc.admin.listOnAirRecordingCandidates.useQuery(undefined, {
    refetchInterval: pollWhileConverting((c: any) => c.episode?.status === "processing"),
  })

  const episodeInvalidate = () => {
    utils.admin.listOnAirEpisodes.invalidate()
    utils.admin.listOnAirRecordingCandidates.invalidate()
  }

  const unpublishEpisode = trpc.admin.unpublishOnAirEpisode.useMutation({ onSuccess: () => { episodeInvalidate(); toast.success("Unpublished — removed from the app's Latest Shows") }, onError: (e) => toast.error(e.message) })
  const deleteEpisode = trpc.admin.deleteOnAirEpisode.useMutation({ onSuccess: (r: any) => { episodeInvalidate(); toast.success(r?.masterKept ? "Deleted — the master WAV backup was kept" : "Deleted") }, onError: (e) => toast.error(e.message) })
  const retryTranscode = trpc.admin.retryOnAirEpisodeTranscode.useMutation({ onSuccess: () => { episodeInvalidate(); toast.success("Converting again…") }, onError: (e) => toast.error(e.message) })
  const episodePending = unpublishEpisode.isPending || deleteEpisode.isPending || retryTranscode.isPending

  const openPublishForCandidate = (c: any) => {
    // Reopening a candidate that has already been published must show what was
    // published, not the raw broadcast metadata — otherwise saving would wipe
    // the episode title, cover and programme the admin set last time.
    const ep = c.episode
    setPublishSource({
      sessionId: c.id,
      episodeId: ep?.id,
      showTitle: ep?.title ?? c.show_title,
      episodeTitle: ep?.episode_title ?? null,
      description: ep?.description ?? c.description,
      coverImageUrl: ep?.cover_image_url ?? c.cover_image_url,
      rjUserId: c.rj_user_id,
      rjStageName: c.rj_stage_name ?? nameFor(c.rj_user_id),
      recordedAt: c.started_at,
      durationSeconds: ep?.duration_seconds ?? c.recording_duration_seconds,
      recordingType: ep?.recording_type ?? c.studio_session?.recording_mode ?? "mixed",
      masterAudioUrl: c.studio_session?.master_recording_url ?? null,
      showScheduleId: ep?.show_schedule_id ?? null,
      visibility: ep?.visibility,
      publishAt: ep?.publish_at ?? null,
    })
    setDialogOpen(true)
  }

  const openEditForEpisode = (e: AdminEpisode) => {
    setPublishSource({
      episodeId: e.id,
      showTitle: e.title,
      episodeTitle: e.episode_title,
      description: e.description,
      coverImageUrl: e.cover_image_url,
      rjUserId: (e as any).rj_user_id,
      rjStageName: e.rj_stage_name,
      recordedAt: e.recorded_at,
      durationSeconds: e.duration_seconds,
      recordingType: e.recording_type,
      masterAudioUrl: e.master_audio_url,
      showScheduleId: (e as any).show_schedule_id,
      visibility: e.visibility,
      publishAt: e.publish_at,
    })
    setDialogOpen(true)
  }

  const episodeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of allEpisodes as any[]) counts[e.status] = (counts[e.status] ?? 0) + 1
    return counts
  }, [allEpisodes])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recordings</h1>
        <p className="text-muted-foreground text-sm">Review, publish, and manage recorded shows across all RJs</p>
      </div>

      {/* ── Studio masters: the entry point into publishing ──────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileAudio className="w-4 h-4" /> Studio Master Recordings ({candidates.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            High-quality WAV masters from BoiAro Studio broadcasts. The WAV is the backup and is never streamed —
            Publish generates an optimised MP3 for the app.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {candidatesLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Studio master recordings yet.</p>
          ) : (
            (candidates as any[]).map((c) => (
              <div key={c.id} className="space-y-2">
                <MasterRecordingCard
                  session={{ ...c, rj_stage_name: c.rj_stage_name ?? nameFor(c.rj_user_id) }}
                  onDelete={() => deleteMasterMutation.mutate({ sessionId: c.id })}
                  isPending={deleteMasterMutation.isPending}
                />
                <div className="flex flex-wrap items-center gap-2 -mt-1 pl-3">
                  {c.episode ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {c.episode.status === "published" ? "Published to the app" : `Episode: ${c.episode.status.replace("_", " ")}`}
                    </Badge>
                  ) : null}
                  <Button
                    size="sm"
                    variant={c.episode ? "outline" : "default"}
                    className="h-7 text-xs gap-1"
                    disabled={c.studio_session?.master_recording_status !== "completed"}
                    onClick={() => openPublishForCandidate(c)}
                  >
                    <Upload className="w-3 h-3" /> {c.episode ? "Edit / Republish" : "Publish"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── The published-show pipeline ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="w-4 h-4" /> Recorded Shows — App Publishing ({episodes.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Published shows appear in the app under On Air → Latest Shows. Nothing goes public without a Publish here.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {EPISODE_TABS.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={episodeTab === t.key ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setEpisodeTab(t.key)}
              >
                {t.label}
                {t.key !== "all" && episodeCounts[t.key] ? ` (${episodeCounts[t.key]})` : ""}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {episodesLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : episodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing here yet — publish a Studio master recording above to put a show in the app.
            </p>
          ) : (
            (episodes as any[]).map((e) => (
              <EpisodeCard
                key={e.id}
                episode={e}
                isPending={episodePending}
                onEdit={() => openEditForEpisode(e)}
                onPublish={e.status !== "published" ? () => openEditForEpisode(e) : undefined}
                onUnpublish={() => unpublishEpisode.mutate({ episodeId: e.id })}
                onDelete={() => deleteEpisode.mutate({ episodeId: e.id })}
                onRetryTranscode={() => retryTranscode.mutate({ episodeId: e.id })}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Legacy Icecast catch-up recordings, unchanged ────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileAudio className="w-4 h-4" /> Catch-up — Pending Review ({pending.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Lower-bitrate MP3s captured off the Icecast stream, used by the older catch-up feed.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {pendingLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing awaiting review.</p>
          ) : (
            pending.map((s: any) => (
              <RecordingCard
                key={s.id}
                session={{ ...s, rj_stage_name: nameFor(s.rj_user_id) }}
                isPending={anyPending}
                onApprove={() => approveMutation.mutate({ sessionId: s.id })}
                onReject={(reason) => rejectMutation.mutate({ sessionId: s.id, reason })}
                onPublish={() => publishMutation.mutate({ sessionId: s.id })}
                onDelete={() => deleteMutation.mutate({ sessionId: s.id })}
                onSave={(update) => saveDetailsMutation.mutate({ sessionId: s.id, ...update })}
                isSaving={saveDetailsMutation.isPending}
                showStats
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileAudio className="w-4 h-4" /> Catch-up — Published ({published.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {publishedLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : published.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published recordings yet.</p>
          ) : (
            published.map((s: any) => (
              <RecordingCard
                key={s.id}
                session={{ ...s, rj_stage_name: nameFor(s.rj_user_id) }}
                isPending={anyPending}
                onUnpublish={() => unpublishMutation.mutate({ sessionId: s.id })}
                onDelete={() => deleteMutation.mutate({ sessionId: s.id })}
                onSave={(update) => saveDetailsMutation.mutate({ sessionId: s.id, ...update })}
                isSaving={saveDetailsMutation.isPending}
                showStats
              />
            ))
          )}
        </CardContent>
      </Card>

      <EpisodePublishDialog
        source={publishSource}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onPublished={episodeInvalidate}
      />
    </div>
  )
}
