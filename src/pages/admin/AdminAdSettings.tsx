import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Save, Globe, Smartphone, Monitor, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const BEHAVIOR_CONFIG = [
  { key: "ad_system_enabled", label: "Enable Ad System", type: "boolean" as const, group: "toggles" },
  { key: "ad_premium_hide_ads", label: "Hide Ads for Premium Users", type: "boolean" as const, group: "toggles" },
  { key: "ad_free_show_ads", label: "Show Ads for Free Users", type: "boolean" as const, group: "toggles" },
  { key: "ad_rewarded_coins", label: "Coins per Rewarded Ad", type: "number" as const, group: "rewards" },
  { key: "ad_max_per_day", label: "Max Rewarded Ads per Day", type: "number" as const, group: "rewards" },
  { key: "ad_cooldown_minutes", label: "Cooldown Between Ads (minutes)", type: "number" as const, group: "rewards" },
];

const PROVIDER_CONFIG = [
  { key: "ad_provider_type", label: "Ad Provider", type: "select" as const, options: ["adsense", "admob", "both", "none"], group: "provider" },
  { key: "ad_adsense_publisher_id", label: "AdSense Publisher ID (ca-pub-XXXX)", type: "text" as const, group: "web" },
  { key: "ad_web_banner_unit_id", label: "Web Banner Ad Unit ID", type: "text" as const, group: "web" },
  { key: "ad_admob_app_id_android", label: "AdMob App ID (Android)", type: "text" as const, group: "app" },
  { key: "ad_admob_app_id_ios", label: "AdMob App ID (iOS)", type: "text" as const, group: "app" },
  { key: "ad_app_banner_unit_id", label: "App Banner Ad Unit ID", type: "text" as const, group: "app" },
  { key: "ad_interstitial_unit_id", label: "Interstitial Ad Unit ID", type: "text" as const, group: "app" },
  { key: "ad_rewarded_unit_id", label: "Rewarded Ad Unit ID", type: "text" as const, group: "app" },
  { key: "ad_app_open_unit_id", label: "App Open Ad Unit ID", type: "text" as const, group: "app" },
  { key: "ad_country_targeting", label: "Country Targeting (comma-separated ISO codes, leave empty for all)", type: "text" as const, group: "targeting" },
];

export default function AdminAdSettings() {
  const utils = trpc.useUtils();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const allKeys = [...BEHAVIOR_CONFIG, ...PROVIDER_CONFIG].map(c => c.key);
  const { data: loadedSettings = {}, isLoading: loading } = trpc.admin.getPlatformSettings.useQuery({ keys: allKeys });
  const saveMutation = trpc.admin.bulkSetPlatformSettings.useMutation({
    onSuccess: async () => {
      await utils.admin.getPlatformSettings.invalidate({ keys: allKeys });
      toast.success("Ad settings saved");
    },
    onError: () => toast.error("Failed to save ad settings"),
  });

  useEffect(() => {
    setSettings(loadedSettings as Record<string, string>);
  }, [loadedSettings]);

  const handleSave = async () => {
    await saveMutation.mutateAsync(
      allKeys.map((key) => ({ key, value: settings[key] ?? "" }))
    );
  };

  const set = (key: string, value: string) => setSettings(p => ({ ...p, [key]: value }));

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
          <Settings className="w-6 h-6 text-primary" /> Ad Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure ad providers, unit IDs, and behavior. No passwords stored — only public ad unit identifiers.
        </p>
      </div>

      {/* System Toggles */}
      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> System Toggles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {BEHAVIOR_CONFIG.filter(c => c.type === "boolean").map(cfg => (
            <div key={cfg.key} className="flex items-center justify-between">
              <Label>{cfg.label}</Label>
              <Switch
                checked={settings[cfg.key] === "true"}
                onCheckedChange={v => set(cfg.key, String(v))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rewarded Ad Values */}
      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base">Rewarded Ad Values</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {BEHAVIOR_CONFIG.filter(c => c.type === "number").map(cfg => (
            <div key={cfg.key} className="space-y-1.5">
              <Label>{cfg.label}</Label>
              <Input
                type="number"
                value={settings[cfg.key] || "0"}
                onChange={e => set(cfg.key, e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Provider Selection */}
      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Ad Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {PROVIDER_CONFIG.filter(c => c.group === "provider").map(cfg => (
            <div key={cfg.key} className="space-y-1.5">
              <Label>{cfg.label}</Label>
              <Select value={settings[cfg.key] || "adsense"} onValueChange={v => set(cfg.key, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cfg.options?.map(o => (
                    <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Web / AdSense IDs */}
      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" /> Web (AdSense) Unit IDs
          </CardTitle>
          <p className="text-xs text-muted-foreground">Public ad unit identifiers from Google AdSense</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {PROVIDER_CONFIG.filter(c => c.group === "web").map(cfg => (
            <div key={cfg.key} className="space-y-1.5">
              <Label>{cfg.label}</Label>
              <Input
                value={settings[cfg.key] || ""}
                onChange={e => set(cfg.key, e.target.value)}
                placeholder={cfg.label}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* App / AdMob IDs */}
      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" /> App (AdMob) Unit IDs
          </CardTitle>
          <p className="text-xs text-muted-foreground">Public ad unit identifiers from Google AdMob for native apps</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {PROVIDER_CONFIG.filter(c => c.group === "app").map(cfg => (
            <div key={cfg.key} className="space-y-1.5">
              <Label>{cfg.label}</Label>
              <Input
                value={settings[cfg.key] || ""}
                onChange={e => set(cfg.key, e.target.value)}
                placeholder={cfg.label}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Targeting */}
      <Card className="border-border/30">
        <CardHeader>
          <CardTitle className="text-base">Targeting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {PROVIDER_CONFIG.filter(c => c.group === "targeting").map(cfg => (
            <div key={cfg.key} className="space-y-1.5">
              <Label>{cfg.label}</Label>
              <Input
                value={settings[cfg.key] || ""}
                onChange={e => set(cfg.key, e.target.value)}
                placeholder="e.g. BD,IN,US"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full" size="lg">
        <Save className="w-4 h-4 mr-2" />
        {saveMutation.isPending ? "Saving..." : "Save All Ad Settings"}
      </Button>
    </div>
  );
}
