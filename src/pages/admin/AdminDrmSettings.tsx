import { useState, useEffect } from "react";
import { Shield, Clock, Users, Eye, Download, FileText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SummaryCard from '@/components/admin/SummaryCard';

interface DrmSettings {
  drm_enabled: boolean;
  drm_token_expiry_minutes: number;
  drm_max_sessions: number;
  drm_watermark_enabled: boolean;
  drm_block_download: boolean;
}

interface AccessLog {
  id: string;
  user_id: string;
  book_id: string;
  content_type: string;
  access_granted: boolean;
  denial_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function AdminDrmSettings() {
  const [settings, setSettings] = useState<DrmSettings>({
    drm_enabled: true,
    drm_token_expiry_minutes: 10,
    drm_max_sessions: 3,
    drm_watermark_enabled: false,
    drm_block_download: true,
  });
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | "granted" | "denied">("all");
  const [stats, setStats] = useState({ total: 0, granted: 0, denied: 0, today: 0 });

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, []);

  const loadSettings = async () => {
    const keys = ["drm_enabled", "drm_token_expiry_minutes", "drm_max_sessions", "drm_watermark_enabled", "drm_block_download"];
    const { data } = await supabase.from("platform_settings").select("key, value").in("key", keys);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r) => (map[r.key] = r.value));
      setSettings({
        drm_enabled: map.drm_enabled !== "false",
        drm_token_expiry_minutes: parseInt(map.drm_token_expiry_minutes) || 10,
        drm_max_sessions: parseInt(map.drm_max_sessions) || 3,
        drm_watermark_enabled: map.drm_watermark_enabled === "true",
        drm_block_download: map.drm_block_download !== "false",
      });
    }
  };

  const loadLogs = async () => {
    const { data, count } = await supabase
      .from("content_access_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) {
      setLogs(data as AccessLog[]);
      const granted = data.filter((l) => l.access_granted).length;
      const today = data.filter((l) => new Date(l.created_at).toDateString() === new Date().toDateString()).length;
      setStats({ total: count || data.length, granted, denied: data.length - granted, today });
    }
  };

  const saveSetting = async (key: string, value: string) => {
    await supabase.from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting("drm_enabled", String(settings.drm_enabled)),
        saveSetting("drm_token_expiry_minutes", String(settings.drm_token_expiry_minutes)),
        saveSetting("drm_max_sessions", String(settings.drm_max_sessions)),
        saveSetting("drm_watermark_enabled", String(settings.drm_watermark_enabled)),
        saveSetting("drm_block_download", String(settings.drm_block_download)),
      ]);
      toast.success("DRM settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (logFilter === "granted") return l.access_granted;
    if (logFilter === "denied") return !l.access_granted;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-black">DRM & Content Protection</h1>
        </div>
        <Badge variant={settings.drm_enabled ? "default" : "secondary"} className="text-xs">
          {settings.drm_enabled ? "DRM Active" : "DRM Disabled"}
        </Badge>
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="flex items-center w-full gap-5 bg-none">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="logs">Access Logs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4 mt-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Shield, label: "Total Requests", value: stats.total, color: "text-primary" },
              { icon: Eye, label: "Granted", value: stats.granted, color: "text-emerald-500" },
              { icon: Users, label: "Denied", value: stats.denied, color: "text-destructive" },
              { icon: Clock, label: "Today", value: stats.today, color: "text-blue-500" },
            ].map((s) => (
              <SummaryCard
                key={s.label}
                icon={s.icon}
                title={s.label}
                value={s.value}
                color="#017B51"
              />
            ))}
          </div>

          {/* Settings Cards */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Protection Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 bg-white text-black">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium ">Enable DRM System</p>
                  <p className="text-xs ">All content access will require token validation</p>
                </div>
                <Switch checked={settings.drm_enabled} onCheckedChange={(v) => setSettings((p) => ({ ...p, drm_enabled: v }))} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium ">Block Direct Downloads</p>
                  <p className="text-xs ">Prevent direct file URL access</p>
                </div>
                <Switch checked={settings.drm_block_download} onCheckedChange={(v) => setSettings((p) => ({ ...p, drm_block_download: v }))} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium ">Watermark on Content</p>
                  <p className="text-xs ">Display user info overlay on ebook reader</p>
                </div>
                <Switch checked={settings.drm_watermark_enabled} onCheckedChange={(v) => setSettings((p) => ({ ...p, drm_watermark_enabled: v }))} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium ">Token Expiry (minutes)</label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={settings.drm_token_expiry_minutes}
                    onChange={(e) => setSettings((p) => ({ ...p, drm_token_expiry_minutes: parseInt(e.target.value) || 10 }))}
                    className="mt-1"
                  />
                  <p className="text-xs  mt-1">How long each access token remains valid</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Max Concurrent Sessions</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.drm_max_sessions}
                    onChange={(e) => setSettings((p) => ({ ...p, drm_max_sessions: parseInt(e.target.value) || 3 }))}
                    className="mt-1"
                  />
                  <p className="text-xs  mt-1">Maximum devices a user can stream from simultaneously</p>
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Select value={logFilter} onValueChange={(v) => setLogFilter(v as any)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="granted">Granted</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadLogs}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>

          <Card className="bg-card border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#017B51]">
                  <TableHead className="text-white">Time</TableHead>
                  <TableHead className="text-white">User</TableHead>
                  <TableHead className="text-white">Type</TableHead>
                  <TableHead className="text-white">Status</TableHead>
                  <TableHead className="text-white">Reason</TableHead>
                  <TableHead className="text-white">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-black py-8">
                      No access logs yet
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow className="bg-[#017B51]" key={log.id}>
                      <TableCell className="text-xs text-white">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-white">{log.user_id.slice(0, 8)}…</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs text-white">{log.content_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.access_granted ? "default" : "destructive"} className="text-xs">
                          {log.access_granted ? "Granted" : "Denied"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-whitemax-w-[200px] truncate text-white">
                        {log.denial_reason || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-white">{log.ip_address || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              icon={FileText}
              title="Total Access Requests"
              value={stats.total}
              color="#017B51"
            />
            <SummaryCard
              icon={Shield}
              title="Approval Rate"
              value={`${stats.total > 0 ? Math.round((stats.granted / stats.total) * 100) : 0}%`}
              color="#017B51"
            />
            <SummaryCard
              icon={Download}
              title="Blocked Attempts"
              value={stats.denied}
              color="#017B51"
            />
          </div>

          <Card className="bg-[#017B51] border-border">
            <CardContent className="p-6">
              <h3 className="font-medium text-white mb-3">Recent Denied Access</h3>
              <div className="space-y-2">
                {logs
                  .filter((l) => !l.access_granted)
                  .slice(0, 5)
                  .map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                      <div>
                        <span className="font-mono text-xs text-white">{l.user_id.slice(0, 8)}…</span>
                        <Badge variant="outline" className="ml-2 text-xs">{l.content_type}</Badge>
                      </div>
                      <span className="text-xs text-white">{l.denial_reason || "Unknown"}</span>
                    </div>
                  ))}
                {logs.filter((l) => !l.access_granted).length === 0 && (
                  <p className="text-sm text-white">No denied access attempts</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
