import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Radio, Plus, Pencil, Trash2, Loader2, PlugZap, CheckCircle2, AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"
import { SocialLiveControls } from "./AdminSocialLiveControls"

type Platform = "facebook" | "youtube"

const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook",
  youtube: "YouTube",
}

/**
 * The ingest endpoints each platform publishes. Offered as a starting point
 * only — the admin still pastes whatever their own Live Producer or Studio
 * page shows them, because these do change.
 */
const SUGGESTED_INGEST: Record<Platform, string> = {
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp",
  youtube: "rtmps://a.rtmps.youtube.com:443/live2",
}

interface ConnectionForm {
  id?: string
  platform: Platform
  account_name: string
  account_ref: string
  rtmp_url: string
  stream_key: string
  enabled: boolean
}

const EMPTY_FORM: ConnectionForm = {
  platform: "youtube",
  account_name: "",
  account_ref: "",
  rtmp_url: SUGGESTED_INGEST.youtube,
  stream_key: "",
  enabled: false,
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") {
    return (
      <Badge variant="outline" className="border-green-500/40 text-green-500">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
      </Badge>
    )
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-500">
        <AlertTriangle className="w-3 h-3 mr-1" /> Error
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-muted-foreground">Not tested</Badge>
}

export default function AdminSocialLive() {
  const connectionsQuery = trpc.admin.socialBroadcastConnections.useQuery()
  const saveMutation = trpc.admin.saveSocialBroadcastConnection.useMutation()
  const deleteMutation = trpc.admin.deleteSocialBroadcastConnection.useMutation()
  const testMutation = trpc.admin.testSocialBroadcastConnection.useMutation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ConnectionForm>(EMPTY_FORM)
  const [testingId, setTestingId] = useState<string | null>(null)

  const connections = connectionsQuery.data ?? []

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (c: (typeof connections)[number]) => {
    setForm({
      id: c.id,
      platform: c.platform as Platform,
      account_name: c.account_name,
      account_ref: c.account_ref ?? "",
      rtmp_url: c.rtmp_url,
      // Never prefilled: the server only ever sends the masked form, so an
      // empty box here means "leave the stored key alone".
      stream_key: "",
      enabled: c.enabled,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        id: form.id,
        platform: form.platform,
        account_name: form.account_name.trim(),
        account_ref: form.account_ref.trim() || undefined,
        rtmp_url: form.rtmp_url.trim(),
        stream_key: form.stream_key.trim() || undefined,
        enabled: form.enabled,
      })
      await connectionsQuery.refetch()
      setDialogOpen(false)
      toast.success(form.id ? "Connection updated" : "Connection added")
    } catch (e: any) {
      toast.error(e.message || "Could not save the connection")
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete the connection "${name}"? Its stream key is removed with it.`)) return
    try {
      await deleteMutation.mutateAsync({ id })
      await connectionsQuery.refetch()
      toast.success("Connection deleted")
    } catch (e: any) {
      toast.error(e.message || "Could not delete the connection")
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const result = await testMutation.mutateAsync({ id })
      await connectionsQuery.refetch()
      if (result.ok) toast.success(result.note ?? "Connection looks good")
      else toast.error(result.problems.join(" "))
    } catch (e: any) {
      toast.error(e.message || "Could not test the connection")
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="w-6 h-6 text-red-400" />
            Social Live
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Broadcast BoiAro On Air to Facebook and YouTube.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add connection
        </Button>
      </div>

      <SocialLiveControls />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="w-5 h-5" />
            Platform connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          {connectionsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No connections yet. Add the Facebook Page or YouTube channel you want to broadcast to.
            </p>
          ) : (
            <div className="space-y-3">
              {connections.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{PLATFORM_LABEL[c.platform as Platform] ?? c.platform}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="truncate">{c.account_name}</span>
                      <StatusBadge status={c.status} />
                      {c.enabled ? (
                        <Badge variant="outline" className="border-blue-500/40 text-blue-500">Enabled</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono break-all">
                      {c.rtmp_url} · key {c.stream_key_masked || "not set"}
                    </p>
                    {c.last_error ? (
                      <p className="text-xs text-red-500">{c.last_error}</p>
                    ) : c.last_tested_at ? (
                      <p className="text-xs text-muted-foreground">
                        Last checked {new Date(c.last_tested_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(c.id)}
                      disabled={testingId === c.id}
                    >
                      {testingId === c.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Test connection"
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(c.id, c.account_name)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit connection" : "Add connection"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select
                value={form.platform}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    platform: v as Platform,
                    // Only replace the ingest URL if it's still an untouched
                    // suggestion — never overwrite something they typed.
                    rtmp_url:
                      f.rtmp_url === SUGGESTED_INGEST[f.platform] || !f.rtmp_url
                        ? SUGGESTED_INGEST[v as Platform]
                        : f.rtmp_url,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Page or channel name</Label>
              <Input
                value={form.account_name}
                onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                placeholder="BoiAro Official"
              />
            </div>

            <div className="space-y-2">
              <Label>Page or channel ID <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={form.account_ref}
                onChange={(e) => setForm((f) => ({ ...f, account_ref: e.target.value }))}
                placeholder="Helps tell two similar accounts apart"
              />
            </div>

            <div className="space-y-2">
              <Label>Ingest URL</Label>
              <Input
                className="font-mono text-xs"
                value={form.rtmp_url}
                onChange={(e) => setForm((f) => ({ ...f, rtmp_url: e.target.value }))}
                placeholder={SUGGESTED_INGEST[form.platform]}
              />
              <p className="text-xs text-muted-foreground">
                From the platform's own live producer page. Must start with rtmp:// or rtmps://, and must
                not include the stream key.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Stream key</Label>
              <Input
                type="password"
                autoComplete="off"
                className="font-mono text-xs"
                value={form.stream_key}
                onChange={(e) => setForm((f) => ({ ...f, stream_key: e.target.value }))}
                placeholder={form.id ? "Leave blank to keep the current key" : "Paste the stream key"}
              />
              <p className="text-xs text-muted-foreground">
                Encrypted before it is stored, and never shown again — only a masked form. Anyone holding
                this key can broadcast to your Page or channel, so treat it like a password.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  Only enabled connections will be offered as broadcast destinations.
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
