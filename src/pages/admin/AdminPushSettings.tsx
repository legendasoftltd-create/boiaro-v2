import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle, XCircle, Loader2, TestTube, Save, Eye, EyeOff, Globe } from "lucide-react";
import { toast } from "sonner";

export default function AdminPushSettings() {
  const utils = trpc.useUtils();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const [form, setForm] = useState({
    service_account_json: "",
    push_enabled: true,
    web_api_key: "",
    web_auth_domain: "",
    web_project_id: "",
    web_storage_bucket: "",
    web_messaging_sender_id: "",
    web_app_id: "",
    web_vapid_key: "",
  });

  const { data, isLoading } = trpc.admin.getFirebaseSettings.useQuery();

  useEffect(() => {
    if (data) {
      setForm({
        service_account_json: data.service_account_json ?? "",
        push_enabled: data.push_enabled ?? true,
        web_api_key: data.web_api_key ?? "",
        web_auth_domain: data.web_auth_domain ?? "",
        web_project_id: data.web_project_id ?? "",
        web_storage_bucket: data.web_storage_bucket ?? "",
        web_messaging_sender_id: data.web_messaging_sender_id ?? "",
        web_app_id: data.web_app_id ?? "",
        web_vapid_key: data.web_vapid_key ?? "",
      });
    }
  }, [data]);

  const saveMutation = trpc.admin.saveFirebaseSettings.useMutation();
  const testMutation = trpc.admin.testFirebasePush.useMutation();

  const handleSave = async () => {
    if (form.service_account_json) {
      try {
        JSON.parse(form.service_account_json);
      } catch {
        toast.error("Invalid JSON — paste the full service account JSON file");
        return;
      }
    }
    setSaving(true);
    try {
      await saveMutation.mutateAsync(form);
      utils.admin.getFirebaseSettings.invalidate();
      setTestResult(null);
      toast.success("Firebase settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync();
      setTestResult(result);
      if (result.ok) toast.success("Firebase credentials are valid ✓");
      else toast.error(result.error || "Connection failed");
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
      toast.error(e.message || "Test failed");
    }
    setTesting(false);
  };

  const isConfigured = Boolean(form.service_account_json.trim());

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" /> Push Notification Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure Firebase Cloud Messaging (FCM) to send native push notifications to Android and iOS.
        </p>
      </div>

      {/* Status card */}
      <Card className="border-border/40">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${isConfigured && form.push_enabled ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
            <div>
              <p className="text-sm font-medium">FCM Status</p>
              <p className="text-xs text-muted-foreground">
                {!isConfigured
                  ? "Not configured — paste service account JSON below"
                  : !form.push_enabled
                  ? "Configured but push is disabled"
                  : "Configured and active"}
              </p>
            </div>
          </div>
          <Badge variant={isConfigured && form.push_enabled ? "default" : "secondary"}>
            {!isConfigured ? "Not set" : form.push_enabled ? "Active" : "Disabled"}
          </Badge>
        </CardContent>
      </Card>

      {/* Main config card */}
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base">Firebase Service Account</CardTitle>
          <CardDescription>
            Go to{" "}
            <span className="font-mono text-xs">Firebase Console → Project Settings → Service Accounts</span>
            {" → "}Generate new private key → paste the full JSON here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
            <div>
              <Label className="text-sm font-medium">Enable Push Notifications</Label>
              <p className="text-xs text-muted-foreground">When off, FCM push is skipped but in-app notifications still work</p>
            </div>
            <Switch
              checked={form.push_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, push_enabled: v }))}
            />
          </div>

          {/* JSON textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="json">Service Account JSON</Label>
              <button
                type="button"
                onClick={() => setShowJson((v) => !v)}
                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {showJson ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showJson ? "Hide" : "Show"}
              </button>
            </div>
            <Textarea
              id="json"
              rows={8}
              placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
              value={showJson ? form.service_account_json : (form.service_account_json ? "••••••••••••••••••••••••••••••••" : "")}
              onChange={(e) => {
                if (showJson) setForm((f) => ({ ...f, service_account_json: e.target.value }));
              }}
              readOnly={!showJson}
              className={`font-mono text-xs ${!showJson && form.service_account_json ? "text-muted-foreground" : ""}`}
            />
            <p className="text-[11px] text-muted-foreground">
              Paste the entire JSON object. It is stored encrypted in the database.
            </p>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {testResult.ok
                ? <><CheckCircle className="w-4 h-4 shrink-0" /> Firebase credentials are valid</>
                : <><XCircle className="w-4 h-4 shrink-0" /> {testResult.error}</>
              }
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || isLoading} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !isConfigured}
              className="gap-2"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Web push config card */}
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" /> Web Push (Browser) Config
          </CardTitle>
          <CardDescription>
            From <span className="font-mono text-xs">Firebase Console → Project Settings → General → Your apps → Web app</span>.
            If no web app exists yet, click "Add app" → Web (the {"</>"} icon) — no domain verification needed.
            The VAPID key is under <span className="font-mono text-xs">Cloud Messaging tab → Web configuration → Generate key pair</span>.
            These are all public/client-safe values (not secrets).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <Input value={form.web_api_key} onChange={(e) => setForm((f) => ({ ...f, web_api_key: e.target.value }))} className="font-mono text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Auth Domain</Label>
              <Input value={form.web_auth_domain} onChange={(e) => setForm((f) => ({ ...f, web_auth_domain: e.target.value }))} placeholder="boiaro.firebaseapp.com" className="font-mono text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Project ID</Label>
              <Input value={form.web_project_id} onChange={(e) => setForm((f) => ({ ...f, web_project_id: e.target.value }))} placeholder="boiaro" className="font-mono text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Storage Bucket</Label>
              <Input value={form.web_storage_bucket} onChange={(e) => setForm((f) => ({ ...f, web_storage_bucket: e.target.value }))} placeholder="boiaro.appspot.com" className="font-mono text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Messaging Sender ID</Label>
              <Input value={form.web_messaging_sender_id} onChange={(e) => setForm((f) => ({ ...f, web_messaging_sender_id: e.target.value }))} className="font-mono text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">App ID</Label>
              <Input value={form.web_app_id} onChange={(e) => setForm((f) => ({ ...f, web_app_id: e.target.value }))} placeholder="1:123:web:abc" className="font-mono text-xs h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">VAPID Key (Web Push certificate public key)</Label>
            <Input value={form.web_vapid_key} onChange={(e) => setForm((f) => ({ ...f, web_vapid_key: e.target.value }))} className="font-mono text-xs h-9" />
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="border-border/40 bg-secondary/20">
        <CardContent className="p-4 space-y-3 text-sm">
          <p className="font-medium">How delivery works now</p>
          <ul className="list-disc list-inside space-y-1.5 text-muted-foreground text-xs">
            <li><b>Web (browser):</b> handled automatically once the fields above are saved — users opt in via the bell toggle on Notification Settings, no app rebuild needed.</li>
            <li><b>Native mobile (Capacitor app):</b> requires <span className="font-mono">google-services.json</span> (Android) / <span className="font-mono">GoogleService-Info.plist</span> (iOS) added to the native project at build time, then <span className="font-mono">npx cap sync</span> — registration code is already wired in.</li>
            <li>Both register through the same token store and receive the same admin-sent notifications.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
