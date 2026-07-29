import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BarChart3, Save, Tag } from "lucide-react";
import { toast } from "sonner";

const KEYS = [
  "analytics_ga4_enabled",
  "analytics_ga4_measurement_id",
  "analytics_gtm_enabled",
  "analytics_gtm_container_id",
];

export default function AdminAnalyticsSettings() {
  const utils = trpc.useUtils();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const allKeys = useMemo(() => KEYS, []);
  const { data: loadedSettings, isLoading: loading } = trpc.admin.getPlatformSettings.useQuery({ keys: allKeys });
  const saveMutation = trpc.admin.bulkSetPlatformSettings.useMutation({
    onSuccess: async () => {
      await utils.admin.getPlatformSettings.invalidate({ keys: allKeys });
      toast.success("Analytics settings saved");
    },
    onError: () => toast.error("Failed to save analytics settings"),
  });

  useEffect(() => {
    if (loadedSettings) setSettings(loadedSettings as Record<string, string>);
  }, [loadedSettings]);

  const set = (key: string, value: string) => setSettings(p => ({ ...p, [key]: value }));

  const ga4IdValid = !settings.analytics_ga4_measurement_id || /^G-[A-Z0-9]+$/.test(settings.analytics_ga4_measurement_id.trim());
  const gtmIdValid = !settings.analytics_gtm_container_id || /^GTM-[A-Z0-9]+$/.test(settings.analytics_gtm_container_id.trim());

  const handleSave = async () => {
    if (!ga4IdValid) return toast.error("GA4 Measurement ID must look like G-XXXXXXXXXX");
    if (!gtmIdValid) return toast.error("GTM Container ID must look like GTM-XXXXXXX");
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

      <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full" size="lg">
        <Save className="w-4 h-4 mr-2" />
        {saveMutation.isPending ? "Saving..." : "Save Analytics Settings"}
      </Button>
    </div>
  );
}
