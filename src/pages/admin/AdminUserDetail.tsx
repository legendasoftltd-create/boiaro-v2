import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, User, Shield, BookOpen, Key,
  Save, Send, Lock, Globe, Facebook, Youtube, Instagram,
  ExternalLink, Calendar, Mail,
} from "lucide-react";
import { CreatorLinkSummary } from "@/components/admin/CreatorLinkSummary";

export default function AdminUserDetail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [authMeta, setAuthMeta] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [application, setApplication] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState("");

  // Editable form state
  const [form, setForm] = useState<any>({});

  const isCreator = type === "author" || type === "narrator" || type === "publisher";
  const tableName = type === "author" ? "authors" : type === "narrator" ? "narrators" : type === "publisher" ? "publishers" : "";

  useEffect(() => {
    loadData();
  }, [type, id]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (type === "user") {
        // Load profile by user_id (id param is user_id from profiles)
        const { data: prof } = await supabase.from("profiles").select("user_id, display_name, avatar_url, bio, preferred_language, is_active, full_name, genre, specialty, experience, referral_code, website_url, facebook_url, instagram_url, youtube_url, portfolio_url, created_at, updated_at").eq("user_id", id!).single();
        setProfile(prof);
        setRecord(prof);
        setForm({
          display_name: prof?.display_name || "",
          bio: prof?.bio || "",
          avatar_url: prof?.avatar_url || "",
        });
        // Load roles
        const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", id!) as any;
        setRoles((r || []).map((x: any) => x.role));
        // Load auth meta via edge function
        loadAuthMeta(id!);
      } else if (isCreator && tableName) {
        // Use admin RPC functions to access all columns including PII
        const rpcName = `admin_get_${type}s` as any;
        const { data: allRecords } = await supabase.rpc(rpcName);
        const data = (allRecords || []).find((r: any) => r.id === id) || null;
        setRecord(data);
        setForm({
          name: data?.name || "",
          name_en: data?.name_en || "",
          bio: data?.bio || data?.description || "",
          email: data?.email || "",
          avatar_url: data?.avatar_url || data?.logo_url || "",
          status: data?.status || "active",
          priority: data?.priority || 0,
          is_featured: data?.is_featured || false,
          is_trending: data?.is_trending || false,
          ...(type === "author" && { genre: data?.genre || "" }),
          ...(type === "narrator" && { specialty: data?.specialty || "", rating: data?.rating || 0 }),
          ...(type === "publisher" && { is_verified: data?.is_verified || false }),
        });
        // Load profile if user_id exists
        if (data?.user_id) {
          const { data: prof } = await supabase.from("profiles").select("user_id, display_name, avatar_url, bio, preferred_language, is_active, full_name, genre, specialty, experience, referral_code, website_url, facebook_url, instagram_url, youtube_url, portfolio_url, created_at, updated_at").eq("user_id", data.user_id).single();
          setProfile(prof);
          const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user_id) as any;
          setRoles((r || []).map((x: any) => x.role));
          loadAuthMeta(data.user_id);
          // Load application
          const roleMap: Record<string, string> = { author: "writer", narrator: "narrator", publisher: "publisher" };
          const { data: app } = await supabase.from("role_applications").select("*").eq("user_id", data.user_id).eq("requested_role", roleMap[type!] as any).order("created_at", { ascending: false }).limit(1) as any;
          if (app?.length) setApplication(app[0]);
          // Load business data
          loadBusinessData(data.user_id);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const loadAuthMeta = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "get_user_meta", userId },
      });
      if (!error && data) setAuthMeta(data);
    } catch {}
  };

  const loadBusinessData = async (userId: string) => {
    const [booksRes, earningsRes, withdrawalsRes] = await Promise.all([
      supabase.from("books").select("id, title, cover_url, submission_status, created_at").eq("submitted_by", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("contributor_earnings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("withdrawal_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);
    setBooks(booksRes.data || []);
    setEarnings(earningsRes.data || []);
    setWithdrawals(withdrawalsRes.data || []);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (type === "user") {
        await supabase.from("profiles").update({
          display_name: form.display_name,
          bio: form.bio,
          avatar_url: form.avatar_url,
        }).eq("user_id", id!);
      } else if (isCreator && tableName) {
        const payload: any = {
          name: form.name,
          name_en: form.name_en,
          email: form.email,
          status: form.status,
          priority: Number(form.priority) || 0,
          is_featured: form.is_featured,
          is_trending: form.is_trending,
        };
        if (type === "author") {
          payload.bio = form.bio;
          payload.avatar_url = form.avatar_url;
          payload.genre = form.genre;
        } else if (type === "narrator") {
          payload.bio = form.bio;
          payload.avatar_url = form.avatar_url;
          payload.specialty = form.specialty;
          payload.rating = Number(form.rating) || 0;
        } else if (type === "publisher") {
          payload.description = form.bio;
          payload.logo_url = form.avatar_url;
          payload.is_verified = form.is_verified;
        }
        await supabase.from(tableName).update(payload).eq("id", id!) as any;
      }
      toast.success("Saved successfully");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handlePasswordReset = async () => {
    const userId = type === "user" ? id! : record?.user_id;
    if (!userId) return toast.error("No linked user account");
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "send_password_reset", userId },
    });
    if (error || data?.error) toast.error(data?.error || "Failed");
    else toast.success("Password reset email sent");
  };

  const handleSetTempPassword = async () => {
    const userId = type === "user" ? id! : record?.user_id;
    if (!userId) return toast.error("No linked user account");
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "set_temp_password", userId, tempPassword },
    });
    if (error || data?.error) toast.error(data?.error || "Failed");
    else {
      toast.success("Temporary password set");
      setPasswordDialog(false);
      setTempPassword("");
    }
  };

  const totalEarnings = earnings.reduce((s, e) => s + Number(e.earned_amount || 0), 0);
  const pendingEarnings = earnings.filter(e => e.status === "pending").reduce((s, e) => s + Number(e.earned_amount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Record not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          {(form.avatar_url) && (
            <img src={form.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-border/40" />
          )}
          <div>
            <h1 className="text-xl font-bold font-serif text-black">
              {type === "user" ? (form.display_name || "User") : form.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[11px] capitalize text-black">{type}</Badge>
              {roles.map(r => (
                <Badge key={r} variant="secondary" className="text-[11px] capitalize">{r}</Badge>
              ))}
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          {isCreator && <TabsTrigger value="business" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Business</TabsTrigger>}
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Security</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Basic Info */}
            <Card className="border-border/30 ">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Basic Information</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {type === "user" ? (
                  <>
                    <div><Label className="text-xs ">Display Name</Label><Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
                    <div><Label className="text-xs ">Avatar URL</Label><Input value={form.avatar_url} onChange={e => setForm({ ...form, avatar_url: e.target.value })} /></div>
                    <div><Label className="text-xs ">Bio</Label><Textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3} /></div>
                  </>
                ) : (
                  <>
                    <div><Label className="text-xs ">Name (Bengali)</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                    <div><Label className="text-xs ">Name (English)</Label><Input value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} /></div>
                    <div><Label className="text-xs ">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                    <div><Label className="text-xs ">Avatar / Logo URL</Label><Input value={form.avatar_url} onChange={e => setForm({ ...form, avatar_url: e.target.value })} /></div>
                    {type === "author" && <div><Label className="text-xs ">Genre</Label><Input value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })} /></div>}
                    {type === "narrator" && (
                      <>
                        <div><Label className="text-xs ">Specialty</Label><Input value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} /></div>
                        <div><Label className="text-xs ">Rating</Label><Input type="number" step="0.1" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} /></div>
                      </>
                    )}
                    <div><Label className="text-xs ">{type === "publisher" ? "Description" : "Bio"}</Label><Textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3} /></div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Controls */}
            <Card className="border-border/30 ">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Controls & Flags</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {isCreator && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Status</Label>
                      <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Priority</Label>
                      <Input type="number" className="w-24 h-8 text-xs" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Featured</Label>
                      <Switch checked={form.is_featured} onCheckedChange={v => setForm({ ...form, is_featured: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Trending</Label>
                      <Switch checked={form.is_trending} onCheckedChange={v => setForm({ ...form, is_trending: v })} />
                    </div>
                    {type === "publisher" && (
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Verified</Label>
                        <Switch checked={form.is_verified} onCheckedChange={v => setForm({ ...form, is_verified: v })} />
                      </div>
                    )}
                  </>
                )}

                {/* Auth metadata */}
                {authMeta && (
                  <div className="pt-3 border-t border-border/30 space-y-2">
                    <p className="text-[11px]  font-medium uppercase tracking-wider">Account Info</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="h-3 w-3 " />
                      <span>{authMeta.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="h-3 w-3 " />
                      <span>Joined: {authMeta.created_at ? new Date(authMeta.created_at).toLocaleDateString() : "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="h-3 w-3 " />
                      <span>Last login: {authMeta.last_sign_in_at ? new Date(authMeta.last_sign_in_at).toLocaleDateString() : "Never"}</span>
                    </div>
                    {authMeta.email_confirmed_at && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Email verified</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Creator Profile Links Summary */}
          {(type === "user" && record?.user_id) && (
            <CreatorLinkSummary userId={record.user_id} />
          )}
          {(isCreator && record?.user_id) && (
            <CreatorLinkSummary userId={record.user_id} />
          )}

          {/* Application Info */}
          {application && (
            <Card className="border-border/30 bg-card/60">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Application Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant="outline" className={`text-[10px] mt-1 ${application.status === "approved" ? "bg-emerald-500/10 text-emerald-400" : application.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>{application.status}</Badge>
                  </div>
                  <div><p className="text-muted-foreground">Full Name</p><p className="font-medium mt-1">{application.full_name || "—"}</p></div>
                  <div><p className="text-muted-foreground">Phone</p><p className="font-medium mt-1">{application.phone || "—"}</p></div>
                  <div><p className="text-muted-foreground">Experience</p><p className="font-medium mt-1 line-clamp-2">{application.experience || "—"}</p></div>
                </div>
                {application.message && <p className="text-xs text-muted-foreground mt-3 italic">"{application.message}"</p>}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {application.portfolio_url && <a href={application.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Portfolio</a>}
                  {application.website_url && <a href={application.website_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1"><Globe className="h-3 w-3" /> Website</a>}
                  {application.facebook_url && <a href={application.facebook_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1"><Facebook className="h-3 w-3" /> Facebook</a>}
                  {application.instagram_url && <a href={application.instagram_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1"><Instagram className="h-3 w-3" /> Instagram</a>}
                  {application.youtube_url && <a href={application.youtube_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1"><Youtube className="h-3 w-3" /> YouTube</a>}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Business Tab */}
        {isCreator && (
          <TabsContent value="business" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/30 bg-card/60">
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Total Earnings</p>
                  <p className="text-2xl font-bold mt-1">৳{totalEarnings.toFixed(0)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/30 bg-card/60">
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Pending Earnings</p>
                  <p className="text-2xl font-bold mt-1">৳{pendingEarnings.toFixed(0)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/30 bg-card/60">
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Books Submitted</p>
                  <p className="text-2xl font-bold mt-1">{books.length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Books */}
            <Card className="border-border/30 bg-card/60">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Submitted Books</CardTitle></CardHeader>
              <CardContent>
                {books.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No books submitted</p>
                ) : (
                  <div className="space-y-2">
                    {books.map(b => (
                      <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/20">
                        {b.cover_url && <img src={b.cover_url} alt="" className="w-8 h-11 rounded object-cover" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{b.title}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{b.submission_status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Withdrawals */}
            <Card className="border-border/30 bg-card/60">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Withdrawal History</CardTitle></CardHeader>
              <CardContent>
                {withdrawals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No withdrawal requests</p>
                ) : (
                  <div className="space-y-2">
                    {withdrawals.map(w => (
                      <div key={w.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20">
                        <div>
                          <p className="text-sm font-medium">৳{Number(w.amount).toFixed(0)}</p>
                          <p className="text-[11px] text-muted-foreground">{w.method} · {new Date(w.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{w.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card className="border-border/30 bg-card/60">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Key className="h-4 w-4" /> Password Management</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Passwords are never displayed. Use these actions to manage user access securely.</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handlePasswordReset}>
                  <Send className="h-3 w-3" /> Send Reset Link
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setPasswordDialog(true)}>
                  <Lock className="h-3 w-3" /> Set Temporary Password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/30 bg-card/60">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Roles</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {roles.length ? roles.map(r => (
                  <Badge key={r} className="capitalize">{r}</Badge>
                )) : <p className="text-xs text-muted-foreground">No roles assigned</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Temp Password Dialog */}
      <Dialog open={passwordDialog} onOpenChange={setPasswordDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Temporary Password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Set a temporary password for this user. They should change it after logging in.</p>
            <div><Label>New Password</Label><Input type="password" value={tempPassword} onChange={e => setTempPassword(e.target.value)} placeholder="Min 6 characters" /></div>
            <Button className="w-full" onClick={handleSetTempPassword} disabled={tempPassword.length < 6}>Set Password</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
