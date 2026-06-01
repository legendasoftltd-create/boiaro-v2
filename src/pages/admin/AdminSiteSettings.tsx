import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Save, Eye, AlertCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { FooterPreview } from "@/components/admin/FooterPreview";
import { SiteImageUpload } from "@/components/admin/SiteImageUpload";
import { useAdminLogger } from "@/hooks/useAdminLogger";


const IMAGE_KEYS = new Set([
  "favicon_url",
  "logo_url",
  "logo_dark_url",
  "logo_mobile_url",
  "logo_footer_url",
]);

const REQUIRED_FIELDS: Record<string, string> = {
  brand_name: "Brand Name is required",
  contact_email: "Contact Email is required",
};

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AdminSiteSettings() {
  const { settings, isLoading, refetch } = useSiteSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(true);
  const { log } = useAdminLogger();

  const updateMutation = trpc.admin.updateSiteSetting.useMutation();

  useEffect(() => {
    if (settings.length > 0) {
      const map: Record<string, string> = {};
      settings.forEach((s) => { map[s.key] = s.value; });
      setValues(map);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const [key, msg] of Object.entries(REQUIRED_FIELDS)) {
      if (!values[key]?.trim()) newErrors[key] = msg;
    }
    if (values.contact_email?.trim() && !validateEmail(values.contact_email.trim())) {
      newErrors.contact_email = "Please enter a valid email address";
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix the errors before saving");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const initialMap: Record<string, string> = {};
      settings.forEach((s) => { initialMap[s.key] = s.value; });

      const changedKeys: string[] = [];
      for (const [key, value] of Object.entries(values)) {
        if (value !== initialMap[key]) {
          changedKeys.push(key);
          await updateMutation.mutateAsync({ key, value });
        }
      }
      await refetch();
      if (changedKeys.length > 0) {
        await log({ module: "settings", action: "Site settings updated", actionType: "update", details: `Updated: ${changedKeys.join(", ")}`, riskLevel: "medium" });
      }
      toast.success("Settings saved successfully");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" /> Site Settings
          </h1>
          <p className="text-muted-foreground text-sm">Manage site-wide configuration keys and values</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} className="gap-1.5">
          <Eye className="w-4 h-4" />
          {showPreview ? "Hide" : "Show"} Preview
        </Button>
      </div>

      {showPreview && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> Live Footer Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FooterPreview values={values} />
          </CardContent>
        </Card>
      )}

      {/* ── Mobile App Prompt Settings ─────────────────────────────────────── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" /> Mobile App Prompt
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Show a "Download App" popup to users engaging with free audiobooks or ebooks on the web.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable / disable */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div>
              <p className="text-sm font-medium">Enable prompt</p>
              <p className="text-xs text-muted-foreground">Show popup for free audiobooks &amp; ebooks</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={values.app_prompt_enabled !== "false"}
                onChange={e => handleChange("app_prompt_enabled", e.target.checked ? "true" : "false")}
              />
              <div className="w-10 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>

          {/* Audiobook timing */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Audiobook — show prompt after</Label>
            <p className="text-xs text-muted-foreground">How long a user plays a free audiobook before seeing the prompt.</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min="0"
                  className="w-20 h-9 text-center"
                  value={Math.floor(Number(values.app_prompt_audio_seconds ?? "300") / 60)}
                  onChange={e => {
                    const mins = Math.max(0, Number(e.target.value) || 0);
                    const secs = Number(values.app_prompt_audio_seconds ?? "300") % 60;
                    handleChange("app_prompt_audio_seconds", String(mins * 60 + secs));
                  }}
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min="0"
                  max="59"
                  className="w-20 h-9 text-center"
                  value={Number(values.app_prompt_audio_seconds ?? "300") % 60}
                  onChange={e => {
                    const secs = Math.min(59, Math.max(0, Number(e.target.value) || 0));
                    const mins = Math.floor(Number(values.app_prompt_audio_seconds ?? "300") / 60);
                    handleChange("app_prompt_audio_seconds", String(mins * 60 + secs));
                  }}
                />
                <span className="text-sm text-muted-foreground">sec</span>
              </div>
              <span className="text-xs text-muted-foreground ml-1">
                (= {values.app_prompt_audio_seconds ?? "300"}s total)
              </span>
            </div>
          </div>

          {/* Ebook threshold */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">eBook — show prompt after</Label>
            <p className="text-xs text-muted-foreground">How much of a free ebook a user reads before seeing the prompt.</p>
            <div className="flex items-center gap-2">
              <Select
                value={values.app_prompt_ebook_threshold_type ?? "percent"}
                onValueChange={v => handleChange("app_prompt_ebook_threshold_type", v)}
              >
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">% read</SelectItem>
                  <SelectItem value="page">Page number</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="1"
                max={(values.app_prompt_ebook_threshold_type ?? "percent") === "percent" ? "99" : undefined}
                className="w-24 h-9 text-center"
                value={values.app_prompt_ebook_value ?? "30"}
                onChange={e => handleChange("app_prompt_ebook_value", e.target.value)}
              />
              <span className="text-sm text-muted-foreground">
                {(values.app_prompt_ebook_threshold_type ?? "percent") === "percent" ? "%" : "page(s)"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> All Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.map((item) => (
            <div key={item.key} className="space-y-1.5">
              <Label className="text-sm font-mono text-muted-foreground">{item.key}</Label>
              {IMAGE_KEYS.has(item.key) ? (
                <SiteImageUpload
                  value={values[item.key] || ""}
                  onChange={(url) => handleChange(item.key, url)}
                  fieldKey={item.key}
                />
              ) : (
                <Input
                  value={values[item.key] || ""}
                  onChange={(e) => handleChange(item.key, e.target.value)}
                  className={errors[item.key] ? "border-destructive" : ""}
                />
              )}
              {errors[item.key] && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{errors[item.key]}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Saving..." : "Save All Settings"}
      </Button>
    </div>
  );
}
