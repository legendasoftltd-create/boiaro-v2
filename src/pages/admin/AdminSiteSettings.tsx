import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings, Save, Eye, AlertCircle } from "lucide-react";
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
