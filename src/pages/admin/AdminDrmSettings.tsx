import { useState } from "react";
import { Shield, Clock, Users, Eye, Download, FileText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const DRM_KEYS = ["drm_enabled", "drm_token_expiry_minutes", "drm_max_sessions", "drm_watermark_enabled", "drm_block_download"];

export default function AdminDrmSettings() {
  const utils = trpc.useUtils();
  const [settings, setSettings] = useState({
    drm_enabled: true,
    drm_token_expiry_minutes: 10,
    drm_max_sessions: 3,
    drm_watermark_enabled: false,
    drm_block_download: true,
  });
  const [logFilter, setLogFilter] = useState<"all" | "granted" | "denied">("all");

  trpc.admin.getPlatformSettings.useQuery(
    { keys: DRM_KEYS },
    {
      onSuccess: (data) => {
        if (data) {
          setSettings({
            drm_enabled: data.drm_enabled !== "false",
            drm_token_expiry_minutes: parseInt(data.drm_token_expiry_minutes as string) || 10,
            drm_max_sessions: parseInt(data.drm_max_sessions as string) || 3,
            drm_watermark_enabled: data.drm_watermark_enabled === "true",
            drm_block_download: data.drm_block_download !== "false",
          });
        }
      },
    }
  );

  const { data: logs = [], refetch: refetchLogs } = trpc.admin.listContentAccessLogs.useQuery({ limit: 100 });

  const bulkSaveMutation = trpc.admin.bulkSetPlatformSettings.useMutation({
    onSuccess: () => { utils.admin.getPlatformSettings.invalidate(); toast.success("DRM settings saved"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    bulkSaveMutation.mutate([
      { key: "drm_enabled", value: String(settings.drm_enabled) },
      { key: "drm_token_expiry_minutes", value: String(settings.drm_token_expiry_minutes) },
      { key: "drm_max_sessions", value: String(settings.drm_max_sessions) },
      { key: "drm_watermark_enabled", value: String(settings.drm_watermark_enabled) },
      { key: "drm_block_download", value: String(settings.drm_block_download) },
    ]);
  };

  const logsArr = logs as any[];
  const granted = logsArr.filter(l => l.access_granted).length;
  const today = logsArr.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length;
  const stats = { total: logsArr.length, granted, denied: logsArr.length - granted, today };

  const filteredLogs = logsArr.filter(l => {
    if (logFilter === "granted") return l.access_granted;
    if (logFilter === "denied") return !l.access_granted;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">DRM & Content Protection</h1>
          <p className="text-sm text-muted-foreground">Manage secure content access, tokens, and protection settings</p>
        </div>
        <Badge variant={settings.drm_enabled ? "default" : "secondary"} className="text-xs">
          {settings.drm_enabled ? "DRM Active" : "DRM Disabled"}
        </Badge>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="logs">Access Logs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Shield, label: "Total Requests", value: stats.total, color: "text-primary" },
              { icon: Eye, label: "Granted", value: stats.granted, color: "text-emerald-500" },
              { icon: Users, label: "Denied", value: stats.denied, color: "text-destructive" },
              { icon: Clock, label: "Today", value: stats.today, color: "text-blue-500" },
            ].map((s) => (
              <Card key={s.label} className="bg-card border-border">
                <CardContent className="p-4">
                  <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Protection Controls</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Enable DRM System</p>
                  <p className="text-xs text-muted-foreground">All content access will require token validation</p>
                </div>
                <Switch checked={settings.drm_enabled} onCheckedChange={(v) => setSettings(p => ({ ...p, drm_enabled: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Block Direct Downloads</p>
                  <p className="text-xs text-muted-foreground">Prevent direct file URL access</p>
                </div>
                <Switch checked={settings.drm_block_download} onCheckedChange={(v) => setSettings(p => ({ ...p, drm_block_download: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Watermark on Content</p>
                  <p className="text-xs text-muted-foreground">Display user info overlay on ebook reader</p>
                </div>
                <Switch checked={settings.drm_watermark_enabled} onCheckedChange={(v) => setSettings(p => ({ ...p, drm_watermark_enabled: v }))} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Token Expiry (minutes)</label>
                  <Input type="number" min={1} max={60} value={settings.drm_token_expiry_minutes} onChange={(e) => setSettings(p => ({ ...p, drm_token_expiry_minutes: parseInt(e.target.value) || 10 }))} className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">How long each access token remains valid</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Max Concurrent Sessions</label>
                  <Input type="number" min={1} max={10} value={settings.drm_max_sessions} onChange={(e) => setSettings(p => ({ ...p, drm_max_sessions: parseInt(e.target.value) || 3 }))} className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">Maximum devices a user can stream from simultaneously</p>
                </div>
              </div>
              <Button onClick={handleSave} disabled={bulkSaveMutation.isPending} className="w-full sm:w-auto">
                {bulkSaveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Select value={logFilter} onValueChange={(v) => setLogFilter(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="granted">Granted</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
          <Card className="bg-card border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Type</TableHead>
                  <TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No access logs yet</TableCell></TableRow>
                ) : filteredLogs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{log.user_id.slice(0, 8)}…</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{log.content_type}</Badge></TableCell>
                    <TableCell><Badge variant={log.access_granted ? "default" : "destructive"} className="text-xs">{log.access_granted ? "Granted" : "Denied"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.denial_reason || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.ip_address || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <FileText className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Access Requests</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <Shield className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">
                  {stats.total > 0 ? Math.round((stats.granted / stats.total) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Approval Rate</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <Download className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{stats.denied}</p>
                <p className="text-xs text-muted-foreground">Blocked Attempts</p>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <h3 className="font-medium text-foreground mb-3">Recent Denied Access</h3>
              <div className="space-y-2">
                {logsArr.filter(l => !l.access_granted).slice(0, 5).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{l.user_id.slice(0, 8)}…</span>
                      <Badge variant="outline" className="ml-2 text-xs">{l.content_type}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{l.denial_reason || "Unknown"}</span>
                  </div>
                ))}
                {logsArr.filter(l => !l.access_granted).length === 0 && (
                  <p className="text-sm text-muted-foreground">No denied access attempts</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
