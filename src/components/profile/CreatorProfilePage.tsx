import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  User, Link as LinkIcon, Shield, Save, Loader2,
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
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<ProfileData>(emptyProfile);

  const { data: profileData } = trpc.profiles.me.useQuery(undefined, { enabled: !!user });

  useEffect(() => {
    if (profileData) {
      setForm({
        display_name: profileData.display_name || "",
        full_name: profileData.full_name || "",
        phone: profileData.phone || "",
        bio: profileData.bio || "",
        experience: profileData.experience || "",
        specialty: profileData.specialty || "",
        genre: profileData.genre || "",
        facebook_url: profileData.facebook_url || "",
        instagram_url: profileData.instagram_url || "",
        youtube_url: profileData.youtube_url || "",
        website_url: profileData.website_url || "",
        portfolio_url: profileData.portfolio_url || "",
        avatar_url: profileData.avatar_url || "",
      });
    }
  }, [profileData]);

  const updateMutation = trpc.profiles.update.useMutation({
    onSuccess: () => {
      utils.profiles.me.invalidate();
      toast.success("Profile saved!");
    },
    onError: (err) => toast.error(err.message),
  });

  const update = (key: keyof ProfileData, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    const { avatar_url: _av, ...rest } = form;
    updateMutation.mutate(rest);
  };

  const initials = (form.display_name || user?.email || roleLabel[0]).slice(0, 2).toUpperCase();
  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const inputClass = "h-10 rounded-xl bg-secondary/40 border-border/40";
  const saving = updateMutation.isPending;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold">{roleLabel} Profile</h1>

      {/* Avatar + header card */}
      <Card className="border-border/30 bg-card/60">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative">
              <Avatar className="w-24 h-24 border-2 border-primary/30">
                <AvatarImage src={form.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-serif">{initials}</AvatarFallback>
              </Avatar>
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
              <p className="text-[10px] text-muted-foreground mt-2">Avatar upload available in Phase 5 (storage provider pending)</p>
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
