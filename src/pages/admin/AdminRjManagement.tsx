import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Radio, Loader2, UserCheck, UserX, MicOff, Plus, Users, Calendar, Headphones, MessageSquare } from "lucide-react"
import { toast } from "sonner"

interface RjRow {
  id: string
  user_id: string
  stage_name: string
  bio: string | null
  specialty: string | null
  is_approved: boolean
  is_active: boolean
  status: "pending" | "approved" | "rejected" | "suspended" | "deactivated"
  callin_enabled: boolean
  created_at: string
  profile_email?: string
}

const STATUS_BADGE: Record<RjRow["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-secondary text-muted-foreground" },
  approved: { label: "Approved", className: "bg-emerald-500/15 text-emerald-400" },
  rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive" },
  suspended: { label: "Suspended", className: "bg-amber-500/15 text-amber-400" },
  deactivated: { label: "Deactivated", className: "bg-muted text-muted-foreground" },
}

interface LiveSessionRow {
  id: string
  rj_user_id: string
  show_title: string | null
  stream_url: string | null
  status: string
  started_at: string
  ended_at: string | null
}

export default function AdminRjManagement() {
  const utils = trpc.useUtils()
  const { data: metrics } = trpc.admin.radioMetrics.useQuery(undefined, { refetchInterval: 15_000 })
  const [rjs, setRjs] = useState<RjRow[]>([])
  const [liveSessions, setLiveSessions] = useState<LiveSessionRow[]>([])
  const [recentSessions, setRecentSessions] = useState<LiveSessionRow[]>([])
  const [loading, setLoading] = useState(true)

  const approveRjMutation = trpc.admin.approveRj.useMutation()
  const rejectRjMutation = trpc.admin.rejectRj.useMutation()
  const suspendRjMutation = trpc.admin.suspendRj.useMutation()
  const deactivateRjMutation = trpc.admin.deactivateRj.useMutation()
  const reactivateRjMutation = trpc.admin.reactivateRj.useMutation()
  const forceEndLiveSessionMutation = trpc.admin.forceEndLiveSession.useMutation()
  const updateRjProfileMutation = trpc.admin.updateRjProfile.useMutation()

  const fetchAll = async () => {
    setLoading(true)
    try {
      // staleTime: 0 forces a fresh network fetch — this runs right after
      // approve/reject/suspend/reactivate mutations, so cached (pre-mutation)
      // data would otherwise be served until the global 30s staleTime expires.
      const [rjData, liveData, recentData] = await Promise.all([
        utils.admin.listRjProfiles.fetch(undefined, { staleTime: 0 }),
        utils.admin.listLiveSessions.fetch({ status: "live", limit: 20 }, { staleTime: 0 }),
        utils.admin.listLiveSessions.fetch({ limit: 20 }, { staleTime: 0 }),
      ])

      // Targeted lookup by exactly the RJs' own user_ids — listUsers's most-
      // recent-500 window silently misses any account older than that,
      // which on a platform with real signup history is most RJs.
      const rjUserIds = [...new Set(((rjData || []) as RjRow[]).map((rj) => rj.user_id))]
      const users = rjUserIds.length ? await utils.admin.getUsersByIds.fetch({ userIds: rjUserIds }, { staleTime: 0 }) : []
      const userLabelMap = new Map(
        users.map((u: any) => [
          u.id,
          u.profile?.display_name?.trim() || u.email || "Unknown",
        ]),
      )
      const nextRjs = ((rjData || []) as RjRow[]).map((rj) => ({
        ...rj,
        profile_email: userLabelMap.get(rj.user_id) || "Unknown",
      }))

      setRjs(nextRjs)
      setLiveSessions((liveData || []) as LiveSessionRow[])
      setRecentSessions((recentData || []) as LiveSessionRow[])
    } catch (error: any) {
      console.error("Failed to load RJ management data", error)
      toast.error(error?.message || "Failed to load RJ management data")
      setRjs([])
      setLiveSessions([])
      setRecentSessions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // Explicit, logged transitions — each records to RjApprovalLog and, where
  // it matters, revokes the RJ's broadcast token immediately. Suspend and
  // Deactivate are deliberately separate actions (not one toggle) — they're
  // distinguishable states now (RjProfile.status), typically suspend =
  // temporary/reversible, deactivate = the RJ is leaving/being removed.
  const runTransition = async (mutate: () => Promise<unknown>, successMsg: string) => {
    try {
      await mutate()
    } catch {
      toast.error("Failed to update")
      return
    }
    toast.success(successMsg)
    fetchAll()
  }

  const approveRj = (rj: RjRow) => runTransition(() => approveRjMutation.mutateAsync({ id: rj.id }), "RJ approved!")
  const rejectRj = (rj: RjRow) => runTransition(() => rejectRjMutation.mutateAsync({ id: rj.id }), "RJ rejected")
  const suspendRj = (rj: RjRow) => runTransition(() => suspendRjMutation.mutateAsync({ id: rj.id }), "RJ suspended — any live session was stopped and their broadcast token revoked")
  const deactivateRj = (rj: RjRow) => {
    if (!window.confirm(`Deactivate ${rj.stage_name}? This ends any live session and revokes their broadcast token.`)) return
    runTransition(() => deactivateRjMutation.mutateAsync({ id: rj.id }), "RJ deactivated — any live session was stopped and their broadcast token revoked")
  }
  const reactivateRj = (rj: RjRow) => runTransition(() => reactivateRjMutation.mutateAsync({ id: rj.id }), "RJ reactivated!")
  const toggleCallin = (rj: RjRow) => runTransition(
    () => updateRjProfileMutation.mutateAsync({ id: rj.id, callin_enabled: !rj.callin_enabled }),
    rj.callin_enabled ? "Call-in access revoked for this RJ" : "Call-in access restored for this RJ"
  )

  const forceEndSession = async (session: LiveSessionRow) => {
    try {
      await forceEndLiveSessionMutation.mutateAsync({ sessionId: session.id })
    } catch {
      toast.error("Failed to end session")
      return
    }

    toast.success("Live session force-ended")
    fetchAll()
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
          <h1 className="text-2xl font-bold">RJ Management</h1>
          <p className="text-muted-foreground text-sm">Manage Radio Jockeys and live sessions</p>
        </div>
        <CreateRjDialog onCreated={fetchAll} />
      </div>

      {/* Radio Overview */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/30"><CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto text-destructive mb-1" />
            <p className="text-xl font-bold">{metrics.currentListeners}</p>
            <p className="text-[11px] text-muted-foreground">Current Listeners</p>
          </CardContent></Card>
          <Card className="border-border/30"><CardContent className="p-4 text-center">
            <Radio className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-xl font-bold">{metrics.sessionsToday}</p>
            <p className="text-[11px] text-muted-foreground">Sessions Today</p>
          </CardContent></Card>
          <Card className="border-border/30"><CardContent className="p-4 text-center">
            <Calendar className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-xl font-bold">{metrics.scheduledShows}</p>
            <p className="text-[11px] text-muted-foreground">Scheduled Shows</p>
          </CardContent></Card>
          <Link to="/admin/recordings">
            <Card className="border-border/30 hover:border-amber-500/40 transition-colors"><CardContent className="p-4 text-center">
              <Headphones className="w-5 h-5 mx-auto text-amber-500 mb-1" />
              <p className="text-xl font-bold">{metrics.catchupCount}</p>
              <p className="text-[11px] text-muted-foreground">Catch-up Recordings</p>
            </CardContent></Card>
          </Link>
          <Card className="border-border/30"><CardContent className="p-4 text-center">
            <UserCheck className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-xl font-bold">{metrics.approvedRjs}</p>
            <p className="text-[11px] text-muted-foreground">Approved RJs</p>
          </CardContent></Card>
          <Card className="border-border/30"><CardContent className="p-4 text-center">
            <Radio className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{metrics.activeStations}/{metrics.totalStations}</p>
            <p className="text-[11px] text-muted-foreground">Active Stations</p>
          </CardContent></Card>
          <Card className="border-border/30"><CardContent className="p-4 text-center">
            <MessageSquare className="w-5 h-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xl font-bold">{metrics.chatMessagesToday}</p>
            <p className="text-[11px] text-muted-foreground">Chat Messages Today</p>
          </CardContent></Card>
          <Card className="border-border/30"><CardContent className="p-4 text-center">
            <Headphones className="w-5 h-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xl font-bold">{metrics.songRequestsToday}</p>
            <p className="text-[11px] text-muted-foreground">Song Requests Today</p>
          </CardContent></Card>
        </div>
      )}

      {/* Currently Live */}
      {liveSessions.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
              Currently On Air
            </CardTitle>
          </CardHeader>
          <CardContent>
            {liveSessions.map((s) => {
              const rj = rjs.find(r => r.user_id === s.rj_user_id)
              return (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-card/60 border border-border">
                  <div>
                    <p className="font-medium">{rj?.stage_name || "Unknown RJ"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.show_title || "Untitled"} · Since {new Date(s.started_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => forceEndSession(s)}>
                    <MicOff className="w-3 h-3 mr-1" /> Force Stop
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* RJ List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-destructive" />
            Radio Jockeys ({rjs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rjs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No RJ profiles yet. Assign the "rj" role to a user to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage Name</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Specialty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Call-in</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rjs.map((rj) => {
                  const badge = STATUS_BADGE[rj.status] ?? STATUS_BADGE.pending
                  return (
                    <TableRow key={rj.id}>
                      <TableCell className="font-medium">{rj.stage_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{rj.profile_email}</TableCell>
                      <TableCell className="text-sm">{rj.specialty || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={badge.className}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch checked={rj.callin_enabled} onCheckedChange={() => toggleCallin(rj)} title="Allow this RJ to offer listener call-in" />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {rj.status === "pending" && (
                            <>
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => approveRj(rj)}>
                                <UserCheck className="w-3 h-3 mr-1" /> Approve
                              </Button>
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => rejectRj(rj)}>
                                <UserX className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {rj.status === "rejected" && (
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => approveRj(rj)}>
                              <UserCheck className="w-3 h-3 mr-1" /> Approve
                            </Button>
                          )}
                          {rj.status === "approved" && (
                            <>
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => suspendRj(rj)}>Suspend</Button>
                              <Button variant="outline" size="sm" className="text-xs text-destructive" onClick={() => deactivateRj(rj)}>Deactivate</Button>
                            </>
                          )}
                          {rj.status === "suspended" && (
                            <>
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => reactivateRj(rj)}>Reactivate</Button>
                              <Button variant="outline" size="sm" className="text-xs text-destructive" onClick={() => deactivateRj(rj)}>Deactivate</Button>
                            </>
                          )}
                          {rj.status === "deactivated" && (
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => reactivateRj(rj)}>Reactivate</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Sessions Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Live Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => {
                const rj = rjs.find(r => r.user_id === s.rj_user_id)
                return (
                  <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-sm">
                    <div>
                      <p className="font-medium">{rj?.stage_name || "Unknown"} — {s.show_title || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.started_at).toLocaleString()}
                        {s.ended_at && ` → ${new Date(s.ended_at).toLocaleTimeString()}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className={
                      s.status === "live" ? "bg-destructive/15 text-destructive" :
                      s.status === "ended" ? "bg-emerald-500/15 text-emerald-400" :
                      "bg-amber-500/15 text-amber-400"
                    }>
                      {s.status}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CreateRjDialog({ onCreated }: { onCreated: () => void }) {
  const createRjMutation = trpc.admin.createRjProfileFromDisplayName.useMutation()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [stageName, setStageName] = useState("")
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!email.trim() || !stageName.trim()) {
      toast.error("Email and stage name are required")
      return
    }

    setCreating(true)

    try {
      await createRjMutation.mutateAsync({
        displayName: email.trim(),
        stageName: stageName.trim(),
      })
    } catch (error: any) {
      toast.error("Failed to create RJ profile: " + (error?.message || "Unknown error"))
      setCreating(false)
      return
    }

    toast.success(`${stageName} is now an approved RJ!`)
    setCreating(false)
    setOpen(false)
    setEmail("")
    setStageName("")
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Add RJ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New RJ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>User Display Name / Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Search by display name..."
            />
            <p className="text-[11px] text-muted-foreground">
              The user must already have a registered account
            </p>
          </div>
          <div className="space-y-2">
            <Label>Stage Name</Label>
            <Input
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="RJ Kobi"
            />
          </div>
          <Button onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Create & Approve RJ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
