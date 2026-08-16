import { useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RecordingCard } from "@/components/radio/RecordingCard"
import { FileAudio, Loader2 } from "lucide-react"
import { toast } from "sonner"

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

  const anyPending = approveMutation.isPending || rejectMutation.isPending || publishMutation.isPending || unpublishMutation.isPending || deleteMutation.isPending

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recordings</h1>
        <p className="text-muted-foreground text-sm">Review, publish, and manage catch-up recordings across all RJs</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileAudio className="w-4 h-4" /> Pending Review ({pending.length})
          </CardTitle>
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
            <FileAudio className="w-4 h-4" /> Published ({published.length})
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
    </div>
  )
}
