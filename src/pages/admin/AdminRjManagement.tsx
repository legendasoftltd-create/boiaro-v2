import { useState, useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Radio, Loader2, UserCheck, UserX, MicOff, Plus } from "lucide-react"
import { toast } from "sonner"

interface RjRow {
  id: string
  user_id: string
  stage_name: string
  bio: string | null
  specialty: string | null
  is_approved: boolean
  is_active: boolean
  created_at: string
  profile_email?: string
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
  const [rjs, setRjs] = useState<RjRow[]>([])
  const [liveSessions, setLiveSessions] = useState<LiveSessionRow[]>([])
  const [recentSessions, setRecentSessions] = useState<LiveSessionRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [rjData, liveData, recentData, usersResponse] = await Promise.all([
        utils.admin.listRjProfiles.fetch(),
        utils.admin.listLiveSessions.fetch({ status: "live", limit: 20 }),
        utils.admin.listLiveSessions.fetch({ limit: 20 }),
        utils.admin.listUsers.fetch({ limit: 500 }),
      ])

      const users = usersResponse?.users ?? []
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

  const toggleApproval = async (rj: RjRow) => {
    try {
      await utils.admin.updateRjProfile.fetch({ id: rj.id, is_approved: !rj.is_approved })
    } catch {
      toast.error("Failed to update")
      return
    }
    toast.success(rj.is_approved ? "RJ approval revoked" : "RJ approved!")
    fetchAll()
  }

  const toggleActive = async (rj: RjRow) => {
    try {
      await utils.admin.updateRjProfile.fetch({ id: rj.id, is_active: !rj.is_active })
    } catch {
      toast.error("Failed to update")
      return
    }
    toast.success(rj.is_active ? "RJ deactivated" : "RJ activated!")
    fetchAll()
  }

  const forceEndSession = async (session: LiveSessionRow) => {
    try {
      await utils.admin.forceEndLiveSession.fetch({ sessionId: session.id })
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
                  <TableHead>Approved</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rjs.map((rj) => (
                  <TableRow key={rj.id}>
                    <TableCell className="font-medium">{rj.stage_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{rj.profile_email}</TableCell>
                    <TableCell className="text-sm">{rj.specialty || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={rj.is_approved ? "default" : "secondary"} className={rj.is_approved ? "bg-emerald-500/15 text-emerald-400" : ""}>
                        {rj.is_approved ? "Approved" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch checked={rj.is_active} onCheckedChange={() => toggleActive(rj)} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleApproval(rj)}
                        className="text-xs"
                      >
                        {rj.is_approved ? (
                          <><UserX className="w-3 h-3 mr-1" /> Revoke</>
                        ) : (
                          <><UserCheck className="w-3 h-3 mr-1" /> Approve</>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
  const utils = trpc.useUtils()
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
      await utils.admin.createRjProfileFromDisplayName.fetch({
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
