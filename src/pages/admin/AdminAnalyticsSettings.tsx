import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BarChart3, Save, Tag, Radio, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const KEYS = [
  "analytics_ga4_enabled",
  "analytics_ga4_measurement_id",
  "analytics_gtm_enabled",
  "analytics_gtm_container_id",
  "analytics_ga4_property_id",
  "analytics_ga4_service_account_json",
];

export default function AdminAnalyticsSettings() {
  const utils = trpc.useUtils();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [showServiceAccount, setShowServiceAccount] = useState(false);
  const allKeys = useMemo(() => KEYS, []);
  const { data: loadedSettings, isLoading: loading } = trpc.admin.getPlatformSettings.useQuery({ keys: allKeys });
  const saveMutation = trpc.admin.bulkSetPlatformSettings.useMutation({
    onSuccess: async () => {
      await utils.admin.getPlatformSettings.invalidate({ keys: allKeys });
      await utils.admin.getGaRealtimeReport.invalidate();
      toast.success("Analytics settings saved");
    },
    onError: () => toast.error("Failed to save analytics settings"),
  });

  const { data: liveReport, isLoading: liveLoading } = trpc.admin.getGaRealtimeReport.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (loadedSettings) setSettings(loadedSettings as Record<string, string>);
  }, [loadedSettings]);

  const set = (key: string, value: string) => setSettings(p => ({ ...p, [key]: value }));

  const ga4IdValid = !settings.analytics_ga4_measurement_id || /^G-[A-Z0-9]+$/.test(settings.analytics_ga4_measurement_id.trim());
  const gtmIdValid = !settings.analytics_gtm_container_id || /^GTM-[A-Z0-9]+$/.test(settings.analytics_gtm_container_id.trim());
  const propertyIdValid = !settings.analytics_ga4_property_id || /^\d+$/.test(settings.analytics_ga4_property_id.trim());

  const handleSave = async () => {
    if (!ga4IdValid) return toast.error("GA4 Measurement ID must look like G-XXXXXXXXXX");
    if (!gtmIdValid) return toast.error("GTM Container ID must look like GTM-XXXXXXX");
    if (!propertyIdValid) return toast.error("GA4 Property ID must be numeric (found in GA4 Admin → Property Settings)");
    if (settings.analytics_ga4_service_account_json?.trim()) {
      try {
        JSON.parse(settings.analytics_ga4_service_account_json.trim());
      } catch {
        return toast.error("Service Account JSON is not valid JSON");
      }
    }
    await saveMutation.mutateAsync(
      allKeys.map((key) => ({ key, value: (settings[key] ?? "").trim() }))
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" /> Analytics & Tag Manager
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect Google Analytics 4 and/or Google Tag Manager. Changes take effect for visitors on their next page load.
        </p>
      </div>

      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Google Analytics 4
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable GA4</Label>
            <Switch
              checked={settings.analytics_ga4_enabled === "true"}
              onCheckedChange={v => set("analytics_ga4_enabled", String(v))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Measurement ID</Label>
            <Input
              value={settings.analytics_ga4_measurement_id || ""}
              onChange={e => set("analytics_ga4_measurement_id", e.target.value)}
              placeholder="G-XXXXXXXXXX"
              className={!ga4IdValid ? "border-destructive" : ""}
            />
            {!ga4IdValid && <p className="text-xs text-destructive">Should look like G-XXXXXXXXXX</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" /> Google Tag Manager
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable GTM</Label>
            <Switch
              checked={settings.analytics_gtm_enabled === "true"}
              onCheckedChange={v => set("analytics_gtm_enabled", String(v))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Container ID</Label>
            <Input
              value={settings.analytics_gtm_container_id || ""}
              onChange={e => set("analytics_gtm_container_id", e.target.value)}
              placeholder="GTM-XXXXXXX"
              className={!gtmIdValid ? "border-destructive" : ""}
            />
            {!gtmIdValid && <p className="text-xs text-destructive">Should look like GTM-XXXXXXX</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" /> Live Report Access
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Optional — lets this page show GA4's Realtime report below, without leaving the admin panel. Needs a Google
            Cloud service account with Viewer access to your GA4 property:
          </p>
          <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5 pl-1">
            <li>In Google Cloud Console, enable the "Google Analytics Data API" and create a service account + JSON key</li>
            <li>In GA4 Admin → Property Access Management, add that service account's email as a Viewer</li>
            <li>Find your numeric Property ID in GA4 Admin → Property Settings (not the G-XXXX Measurement ID)</li>
          </ol>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>GA4 Property ID</Label>
            <Input
              value={settings.analytics_ga4_property_id || ""}
              onChange={e => set("analytics_ga4_property_id", e.target.value)}
              placeholder="123456789"
              className={!propertyIdValid ? "border-destructive" : ""}
            />
            {!propertyIdValid && <p className="text-xs text-destructive">Numeric only — this isn't the G-XXXX Measurement ID</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              Service Account JSON
              <button type="button" onClick={() => setShowServiceAccount(s => !s)} className="text-muted-foreground hover:text-foreground">
                {showServiceAccount ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </Label>
            <Textarea
              value={settings.analytics_ga4_service_account_json || ""}
              onChange={e => set("analytics_ga4_service_account_json", e.target.value)}
              placeholder='{"type": "service_account", "project_id": "...", ...}'
              className={`font-mono text-xs min-h-24 ${!showServiceAccount ? "blur-sm focus:blur-none" : ""}`}
            />
            <p className="text-[11px] text-muted-foreground">Paste the full contents of the downloaded JSON key file.</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full" size="lg">
        <Save className="w-4 h-4 mr-2" />
        {saveMutation.isPending ? "Saving..." : "Save Analytics Settings"}
      </Button>

      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="w-4 h-4 text-destructive" />
            Live Report
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse ml-1" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {liveLoading && !liveReport ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : !liveReport?.configured ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <p>Set up Live Report Access above (Property ID + Service Account JSON) and save to see active users here.</p>
            </div>
          ) : liveReport.error ? (
            <div className="flex items-start gap-2 text-sm text-destructive py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{liveReport.error}</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-4xl font-bold text-primary">{liveReport.activeUsers ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active users right now</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Active Pages</h4>
                  {liveReport.topPages && liveReport.topPages.length > 0 ? (
                    <ul className="space-y-1">
                      {liveReport.topPages.map(p => (
                        <li key={p.path} className="flex items-center justify-between text-sm">
                          <span className="truncate mr-2 text-muted-foreground">{p.path}</span>
                          <span className="font-medium">{p.activeUsers}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No active visitors right now</p>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Countries</h4>
                  {liveReport.topCountries && liveReport.topCountries.length > 0 ? (
                    <ul className="space-y-1">
                      {liveReport.topCountries.map(c => (
                        <li key={c.country} className="flex items-center justify-between text-sm">
                          <span className="truncate mr-2 text-muted-foreground">{c.country}</span>
                          <span className="font-medium">{c.activeUsers}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No active visitors right now</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">Refreshes every 15 seconds</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
