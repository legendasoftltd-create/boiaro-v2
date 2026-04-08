import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  User, Link as LinkIcon, Shield, Camera, Save, Loader2,
  Facebook, Instagram, Youtube, Globe, ExternalLink, Calendar,
} from "lucide-react";

interface ProfileData {
  display_name: string;
  full_name: string;
  phone: string;
  bio: string;
  experience: string;
  specialty: string;
  genre: string;
  facebook_url: string;
  instagram_url: string;
  youtube_url: string;
  website_url: string;
  portfolio_url: string;
  avatar_url: string;
}

const emptyProfile: ProfileData = {
  display_name: "", full_name: "", phone: "", bio: "", experience: "",
  specialty: "", genre: "", facebook_url: "", instagram_url: "",
  youtube_url: "", website_url: "", portfolio_url: "", avatar_url: "",
};

interface Props {
  roleLabel: string;
  bioLabel?: string;
  bioPlaceholder?: string;
  specialtyLabel?: string;
  specialtyPlaceholder?: string;
}

export default function CreatorProfilePage({
  roleLabel,
  bioLabel = "Bio / Description",
  bioPlaceholder = "Tell readers about yourself",
  specialtyLabel = "Specialty / Genre",
  specialtyPlaceholder = "Your area of expertise",
}: Props) {
  const { user, profile, updateProfile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileData>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [_extendedLoaded, setExtendedLoaded] = useState(false);

  // Load extended profile fields from DB (beyond what AuthContext provides)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, phone, experience, specialty, genre, facebook_url, instagram_url, youtube_url, website_url, portfolio_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setForm((prev) => ({
            ...prev,
            full_name: (data as any).full_name || "",
            phone: (data as any).phone || "",
            experience: (data as any).experience || "",
            specialty: (data as any).specialty || "",
            genre: (data as any).genre || "",
            facebook_url: (data as any).facebook_url || "",
            instagram_url: (data as any).instagram_url || "",
            youtube_url: (data as any).youtube_url || "",
            website_url: (data as any).website_url || "",
            portfolio_url: (data as any).portfolio_url || "",
          }));
        }
        setExtendedLoaded(true);
      });
  }, [user]);

  // Sync AuthContext profile fields
  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        display_name: profile.display_name || "",
        bio: profile.bio || "",
        avatar_url: profile.avatar_url || "",
      }));
    }
  }, [profile]);

  const update = (key: keyof ProfileData, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid format", description: "Only JPG, PNG, and WebP are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = urlData.publicUrl + "?t=" + Date.now();
    await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("user_id", user.id);
    update("avatar_url", avatarUrl);
    setUploading(false);
    toast({ title: "Photo updated!" });
  };

  const handleAvatarRemove = async () => {
    if (!user) return;
    setUploading(true);
    await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
    update("avatar_url", "");
    setUploading(false);
    toast({ title: "Photo removed" });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { avatar_url: _avatar_url, ...updates } = form;
    await supabase.from("profiles").update(updates as any).eq("user_id", user.id);
    // Sync AuthContext for display_name/bio
    await updateProfile({ display_name: form.display_name, bio: form.bio });
    setSaving(false);
    toast({ title: "Profile saved!" });
  };

  const initials = (form.display_name || user?.email || roleLabel[0]).slice(0, 2).toUpperCase();
  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const inputClass = "h-10 rounded-xl bg-secondary/40 border-border/40";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold">{roleLabel} Profile</h1>

      {/* Avatar + header card */}
      <Card className="border-border/30 bg-card/60">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative group">
              <Avatar className="w-24 h-24 border-2 border-primary/30">
                <AvatarImage src={form.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-serif">{initials}</AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              </button>
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div className="text-center sm:text-left">
              <h2 className="text-lg font-bold font-serif">{form.display_name || roleLabel}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1.5 justify-center sm:justify-start">
                <Badge variant="outline" className="text-[11px] border-primary/30 text-primary">{roleLabel}</Badge>
                {joinedDate && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Joined {joinedDate}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start">
                <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Camera className="w-3 h-3" /> Change Photo
                </Button>
                {form.avatar_url && (
                  <Button variant="ghost" size="sm" className="text-[11px] h-7 text-destructive hover:text-destructive" onClick={handleAvatarRemove} disabled={uploading}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabbed content */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="bg-secondary/40 border border-border/30 h-auto gap-0.5 p-1">
          <TabsTrigger value="info" className="gap-1.5 text-[13px]"><User className="w-3.5 h-3.5" /> Profile Info</TabsTrigger>
          <TabsTrigger value="social" className="gap-1.5 text-[13px]"><LinkIcon className="w-3.5 h-3.5" /> Social Links</TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5 text-[13px]"><Shield className="w-3.5 h-3.5" /> Account</TabsTrigger>
        </TabsList>

        {/* Profile Info Tab */}
        <TabsContent value="info">
          <Card className="border-border/30 bg-card/60">
            <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Full Name</Label>
                  <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Your full name" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Display Name</Label>
                  <Input value={form.display_name} onChange={(e) => update("display_name", e.target.value)} placeholder="Public display name" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Email</Label>
                  <Input value={user?.email || ""} disabled className={`${inputClass} opacity-60`} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Phone</Label>
                  <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+880 1XXX XXXXXX" className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">{bioLabel}</Label>
                <Textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} placeholder={bioPlaceholder} className="rounded-xl bg-secondary/40 border-border/40 min-h-[100px]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Experience</Label>
                  <Textarea value={form.experience} onChange={(e) => update("experience", e.target.value)} placeholder="Your professional experience" className="rounded-xl bg-secondary/40 border-border/40 min-h-[80px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">{specialtyLabel}</Label>
                  <Input value={form.specialty || form.genre} onChange={(e) => { update("specialty", e.target.value); update("genre", e.target.value); }} placeholder={specialtyPlaceholder} className={inputClass} />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving} className="btn-gold text-[13px] gap-1.5">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social Links Tab */}
        <TabsContent value="social">
          <Card className="border-border/30 bg-card/60">
            <CardHeader><CardTitle className="text-base">Social & Links</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] flex items-center gap-1.5"><Facebook className="w-3.5 h-3.5 text-primary" /> Facebook</Label>
                  <Input value={form.facebook_url} onChange={(e) => update("facebook_url", e.target.value)} placeholder="https://facebook.com/..." className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] flex items-center gap-1.5"><Instagram className="w-3.5 h-3.5 text-primary" /> Instagram</Label>
                  <Input value={form.instagram_url} onChange={(e) => update("instagram_url", e.target.value)} placeholder="https://instagram.com/..." className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5 text-primary" /> YouTube</Label>
                  <Input value={form.youtube_url} onChange={(e) => update("youtube_url", e.target.value)} placeholder="https://youtube.com/..." className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-primary" /> Website</Label>
                  <Input value={form.website_url} onChange={(e) => update("website_url", e.target.value)} placeholder="https://yoursite.com" className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Portfolio / Sample URL</Label>
                <Input value={form.portfolio_url} onChange={(e) => update("portfolio_url", e.target.value)} placeholder="https://..." className={inputClass} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="btn-gold text-[13px] gap-1.5">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account">
          <Card className="border-border/30 bg-card/60">
            <CardHeader><CardTitle className="text-base">Account Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Role</Label>
                  <div><Badge variant="outline" className="border-primary/30 text-primary">{roleLabel}</Badge></div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Joined</Label>
                  <p className="text-sm">{joinedDate || "N/A"}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">Email</Label>
                  <p className="text-sm">{user?.email}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-muted-foreground">User ID</Label>
                  <p className="text-sm font-mono text-muted-foreground truncate">{user?.id}</p>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                To change your email or password, please contact the admin or use your account settings.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
