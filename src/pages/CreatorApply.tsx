import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { PenTool, Building2, Mic2, Radio, Upload, ArrowLeft, Facebook, Instagram, Youtube, Globe, Link2 } from "lucide-react";

const roleOptions = [
  { value: "writer", label: "Writer", icon: PenTool, desc: "Publish & manage your books" },
  { value: "publisher", label: "Publisher", icon: Building2, desc: "Manage catalog & inventory" },
  { value: "narrator", label: "Narrator", icon: Mic2, desc: "Narrate & submit audiobooks" },
  { value: "rj", label: "Radio Jockey", icon: Radio, desc: "Go live & broadcast shows" },
] as const;

type RoleValue = typeof roleOptions[number]["value"];

export default function CreatorApply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedRole, setSelectedRole] = useState<RoleValue | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    display_name: "", bio: "", experience: "", message: "",
    facebook_url: "", instagram_url: "", youtube_url: "", website_url: "", portfolio_url: "",
  });

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
  };

  const applyMutation = trpc.profiles.applyForRole.useMutation({
    onSuccess: () => {
      toast({ title: "Application submitted!", description: "We'll review your application soon." });
      navigate("/profile");
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) { toast({ title: "Select a role", variant: "destructive" }); return; }
    if (!user) {
      localStorage.setItem("pending_role_application", JSON.stringify({ role: selectedRole, ...form }));
      toast({ title: "Please sign in first", description: "Create an account or log in, then your application will be submitted." });
      navigate("/auth");
      return;
    }
    const notes = [form.bio, form.experience, form.message].filter(Boolean).join("\n\n");
    applyMutation.mutate({
      role: selectedRole,
      displayName: form.display_name || undefined,
      notes: notes || undefined,
      portfolioUrl: form.portfolio_url || undefined,
    });
  };

  return (
    <div className="min-h-[100svh] bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold text-primary">Join BoiAro as a Creator</h1>
          <p className="text-muted-foreground mt-2 text-sm">Apply to become a writer, publisher, narrator, or radio jockey</p>
        </div>

        <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-2xl shadow-black/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-serif">Creator Application</CardTitle>
            <CardDescription className="text-[13px]">Fill out the form below to apply</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Role Selection */}
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">Select Role *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {roleOptions.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setSelectedRole(r.value)}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        selectedRole === r.value
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                          : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <r.icon className="w-6 h-6 mx-auto mb-2" />
                      <p className="text-[13px] font-medium">{r.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Profile Image (preview only — upload is Phase 5) */}
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">Profile Image</Label>
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-border/50 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors overflow-hidden bg-secondary/20"
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-[12px] text-muted-foreground">Click to upload</p>
                    <p className="text-[11px] text-muted-foreground/60">JPG, PNG • Max 5MB</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </div>
              </div>

              {/* Display Name */}
              <div className="space-y-1.5">
                <Label className="text-[13px]">Display Name *</Label>
                <Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} required placeholder="প্রদর্শন নাম" className="h-10 rounded-xl bg-secondary/40 border-border/40" />
              </div>

              {/* Bio & Experience */}
              <div className="space-y-1.5">
                <Label className="text-[13px]">Bio / Description *</Label>
                <Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} required placeholder={selectedRole === "rj" ? "আপনার পরিচয় ও broadcasting অভিজ্ঞতা..." : "Tell us about yourself and your work..."} rows={3} className="rounded-xl bg-secondary/40 border-border/40 resize-none" />
              </div>

              {selectedRole === "rj" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Specialty</Label>
                    <Input value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="e.g. Drama, Poetry, Talk Show..." className="h-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Sample Voice / Stream Link</Label>
                    <Input value={form.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} placeholder="https://soundcloud.com/..." className="h-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-[13px]">Experience</Label>
                <Textarea value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder={selectedRole === "rj" ? "Broadcasting / voice acting experience..." : "Your relevant experience..."} rows={2} className="rounded-xl bg-secondary/40 border-border/40 resize-none" />
              </div>

              {selectedRole !== "rj" && (
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Why do you want to join? (optional)</Label>
                  <Input value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Motivation or additional info..." className="h-10 rounded-xl bg-secondary/40 border-border/40" />
                </div>
              )}

              {/* Social Links */}
              <div className="space-y-3">
                <Label className="text-[13px] font-medium">Social & Portfolio Links</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={form.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} placeholder="Facebook URL" className="h-10 pl-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={form.instagram_url} onChange={(e) => set("instagram_url", e.target.value)} placeholder="Instagram URL" className="h-10 pl-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                  <div className="relative">
                    <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={form.youtube_url} onChange={(e) => set("youtube_url", e.target.value)} placeholder="YouTube URL" className="h-10 pl-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="Website URL" className="h-10 pl-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                </div>
                {selectedRole !== "rj" && (
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={form.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} placeholder="Portfolio / Sample Work URL" className="h-10 pl-10 rounded-xl bg-secondary/40 border-border/40" />
                  </div>
                )}
              </div>

              {/* Submit */}
              <Button type="submit" className="w-full btn-gold h-11 text-[13px] font-medium" disabled={applyMutation.isPending || !selectedRole}>
                {applyMutation.isPending ? "Submitting..." : "Submit Application"}
              </Button>

              {!user && (
                <p className="text-[11px] text-center text-muted-foreground">
                  You'll be redirected to sign in before your application is saved.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
