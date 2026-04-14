import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Coins, Save } from "lucide-react";
import { toast } from "sonner";

interface CoinSetting {
  key: string;
  value: string;
  label: string;
  type: "number" | "boolean";
  description?: string;
}

const SETTINGS_CONFIG: Omit<CoinSetting, "value">[] = [
  { key: "coin_system_enabled", label: "Enable Coin System", type: "boolean", description: "Master toggle for the entire coin economy" },
  { key: "coin_unlock_enabled", label: "Enable Unlock by Coin", type: "boolean", description: "Allow users to unlock content with coins" },
  { key: "coin_conversion_ratio", label: "Coin to BDT Ratio (1 coin = X BDT)", type: "number", description: "e.g. 0.01 means 1 coin = ৳0.01" },
  { key: "coin_min_unlock", label: "Minimum Coins for Unlock", type: "number" },
  { key: "coin_daily_login_reward", label: "Daily Login Reward (coins)", type: "number", description: "Coins given per daily login" },
  { key: "coin_ad_reward", label: "Rewarded Ad Coins", type: "number", description: "Coins earned per ad view" },
  { key: "coin_signup_bonus", label: "Signup Bonus (coins)", type: "number", description: "Coins given to new users on registration" },
  { key: "coin_daily_limit", label: "Daily Earn Limit (coins)", type: "number", description: "Max coins a user can earn per day" },
  { key: "coin_expiry_days", label: "Coin Expiry (days)", type: "number", description: "Days until earned coins expire (0 = no expiry)" },
  { key: "coin_campaign_bonus", label: "Campaign Bonus Coins", type: "number" },
  { key: "ads_per_quick_unlock", label: "Ads per Quick Unlock", type: "number", description: "Number of ads to watch for quick chapter unlock (default 5)" },
  { key: "bonus_coin_per_ad_session", label: "Bonus Coins per Ad Session", type: "number", description: "Bonus coins awarded after completing a quick unlock ad session" },
];

export default function AdminCoinSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("*")
        .like("key", "coin_%");
      const map: Record<string, string> = {};
      (data || []).forEach((d: any) => { map[d.key] = d.value; });
      setSettings(map);
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    for (const [key, value] of Object.entries(settings)) {
      await supabase
        .from("platform_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    }
    toast.success("Coin settings saved");
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-serif font-bold  text-black">
           Coin Settings
        </h1>
        
      </div>

      <Card className="border-border/30">
        <CardHeader><CardTitle className="text-base">System Toggles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {SETTINGS_CONFIG.filter(s => s.type === "boolean").map(cfg => (
            <div key={cfg.key} className="flex items-center justify-between">
              <div>
                <Label>{cfg.label}</Label>
                {cfg.description && <p className="text-xs text-muted-foreground">{cfg.description}</p>}
              </div>
              <Switch
                checked={settings[cfg.key] === "true"}
                onCheckedChange={v => setSettings(p => ({ ...p, [cfg.key]: String(v) }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/30">
        <CardHeader><CardTitle className="text-base">Coin Values</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {SETTINGS_CONFIG.filter(s => s.type === "number").map(cfg => (
            <div key={cfg.key} className="space-y-1.5">
              <Label>{cfg.label}</Label>
              {cfg.description && <p className="text-xs text-muted-foreground">{cfg.description}</p>}
              <Input
                type="number"
                step={cfg.key === "coin_conversion_ratio" ? "0.01" : "1"}
                value={settings[cfg.key] || "0"}
                onChange={e => setSettings(p => ({ ...p, [cfg.key]: e.target.value }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/30 bg-gray-200">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2">Current Economy Summary</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-black">
            <span>1 coin = ৳{settings.coin_conversion_ratio || "0.01"}</span>
            <span>Daily limit: {settings.coin_daily_limit || "50"} coins</span>
            <span>Signup bonus: {settings.coin_signup_bonus || "10"} coins</span>
            <span>Expiry: {settings.coin_expiry_days || "30"} days</span>
            <span>Ad reward: {settings.coin_ad_reward || "5"} coins</span>
            <span>Login reward: {settings.coin_daily_login_reward || "5"} coins</span>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
