import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings, type SiteSetting } from "@/hooks/useSiteSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Settings, Save, Upload, X, Globe, Phone, Share2, Smartphone, Type, Eye, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { FooterPreview } from "@/components/admin/FooterPreview";
import { useAdminLogger } from "@/hooks/useAdminLogger";

const CATEGORY_META: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  brand: { title: "Brand Identity", description: "Logo, favicon, name, and tagline", icon: Type },
  footer: { title: "Footer Content & Visibility", description: "About text, trust line, newsletter toggle, and section visibility", icon: Globe },
  contact: { title: "Contact Information", description: "Email, phone, and address", icon: Phone },
  social: { title: "Social Links", description: "Facebook, YouTube, Instagram, Twitter/X", icon: Share2 },
  policy_links: { title: "Policy & Support Links", description: "Editable footer policy links with labels, URLs, and active toggles", icon: AlertCircle },
  copyright: { title: "Copyright & Tagline", description: "Copyright text and bottom tagline", icon: Type },
  app: { title: "App Download", description: "Mobile app links and toggle", icon: Smartphone },
};

const CATEGORY_ORDER = ["brand", "footer", "contact", "social", "policy_links", "copyright", "app"];

const REQUIRED_FIELDS: Record<string, string> = {
  brand_name: "Brand Name is required",
  contact_email: "Contact Email is required",
};

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AdminSiteSettings() {
  const { settings, isLoading, refetch } = useSiteSettings();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(true);
  const { log } = useAdminLogger();

  useEffect(() => {
    if (settings.length > 0) {
      const map: Record<string, string> = {};
      settings.forEach((s) => { map[s.setting_key] = s.setting_value; });
      setValues(map);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleImageUpload = async (key: string, file: File) => {
    setUploading(key);
    try {
      const ext = file.name.split(".").pop();
      const path = `site/${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      handleChange(key, urlData.publicUrl);
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
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
      const changedKeys: string[] = [];
      const initialMap: Record<string, string> = {};
      settings.forEach((s) => { initialMap[s.setting_key] = s.setting_value; });

      for (const [key, value] of Object.entries(values)) {
        if (value !== initialMap[key]) changedKeys.push(key);
        await supabase
          .from("site_settings")
          .update({ setting_value: value, updated_at: new Date().toISOString() })
          .eq("setting_key", key);
      }
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["site-settings"] });
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

  const grouped: Record<string, SiteSetting[]> = {};
  settings.forEach((s) => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2 text-black">
             Footer & Brand Settings
          </h1>
          
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
            <p className="text-xs ">Changes update in real-time as you edit</p>
          </CardHeader>
          <CardContent>
            <FooterPreview values={values} />
          </CardContent>
        </Card>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const meta = CATEGORY_META[cat];
        const items = grouped[cat];
        if (!meta || !items?.length) return null;
        const Icon = meta.icon;

        return (
          <Card key={cat} className="border-border/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                {meta.title}
              </CardTitle>
              <p className="text-xs ">{meta.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {items
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item) => (
                  <SettingField
                    key={item.setting_key}
                    item={item}
                    value={values[item.setting_key] || ""}
                    onChange={(v) => handleChange(item.setting_key, v)}
                    onImageUpload={(f) => handleImageUpload(item.setting_key, f)}
                    uploading={uploading === item.setting_key}
                    error={errors[item.setting_key]}
                  />
                ))}
            </CardContent>
          </Card>
        );
      })}

      <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Saving..." : "Save All Settings"}
      </Button>
    </div>
  );
}

function SettingField({
  item,
  value,
  onChange,
  onImageUpload,
  uploading,
  error,
}: {
  item: SiteSetting;
  value: string;
  onChange: (v: string) => void;
  onImageUpload: (f: File) => void;
  uploading: boolean;
  error?: string;
}) {
  if (item.setting_type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-sm">{item.label}</Label>
        <Switch checked={value === "true"} onCheckedChange={(v) => onChange(String(v))} />
      </div>
    );
  }

  if (item.setting_type === "image") {
    return (
      <div className="space-y-2">
        <Label className="text-sm">{item.label}</Label>
        {value && (
          <div className="relative inline-block">
            <img src={value} alt={item.label} className="h-16 rounded-md border border-border object-contain bg-muted p-1" />
            <button
              onClick={() => onChange("")}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div>
          <label className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-md border border-border cursor-pointer hover:bg-accent transition-colors">
            <Upload className="w-3.5 h-3.5" />
            {uploading ? "Uploading..." : "Upload Image"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImageUpload(f);
            }} />
          </label>
        </div>
        {!value && (
          <Input
            placeholder="Or paste image URL"
            value=""
            onChange={(e) => onChange(e.target.value)}
            className="text-xs"
          />
        )}
      </div>
    );
  }

  if (item.setting_type === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{item.label}</Label>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
        {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{item.label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className={error ? "border-destructive" : ""} />
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  );
}
