import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Pencil, Trash2, Eye, User } from "lucide-react";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { AvatarUpload } from "@/components/admin/AvatarUpload";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeactivateModal } from "@/components/admin/DeactivateModal";
import { CreatorAccountFields } from "@/components/admin/CreatorAccountFields";
import { CreatorAccountCard } from "@/components/admin/CreatorAccountCard";
import { useCreatorAccount } from "@/hooks/useCreatorAccount";
import { toast } from "sonner";

export default function AdminNarrators() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ name: "", name_en: "", bio: "", specialty: "", avatar_url: "", is_featured: false, is_trending: false, rating: 0, priority: 0, phone: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null);

  const [createAccount, setCreateAccount] = useState(false);
  const [accEmail, setAccEmail] = useState("");
  const [accPassword, setAccPassword] = useState("");
  const [accConfirm, setAccConfirm] = useState("");
  const { createCreatorWithAccount, linkExistingProfile, saving } = useCreatorAccount();

  const load = async () => {
    const { data } = await supabase.rpc("admin_get_narrators" as any);
    setItems((data as any[]) || []);
  };
  useEffect(() => { load(); }, []);

  const resetAccountFields = () => { setCreateAccount(false); setAccEmail(""); setAccPassword(""); setAccConfirm(""); };

  const openNew = () => { setEdit(null); setForm({ name: "", name_en: "", bio: "", specialty: "", avatar_url: "", is_featured: false, is_trending: false, rating: 0, priority: 0, phone: "" }); resetAccountFields(); setOpen(true); };
  const openEdit = (n: any) => { setEdit(n); setForm({ name: n.name, name_en: n.name_en || "", bio: n.bio || "", specialty: n.specialty || "", avatar_url: n.avatar_url || "", is_featured: n.is_featured || false, is_trending: n.is_trending || false, rating: n.rating || 0, priority: n.priority || 0, phone: n.phone || "" }); resetAccountFields(); setOpen(true); };

  const save = async () => {
    const payload = { ...form, rating: Number(form.rating), priority: Number(form.priority) || 0 };

    if (edit) {
      const { error } = await supabase.from("narrators").update(payload).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }

      if (createAccount && !edit.user_id && accEmail) {
        await linkExistingProfile({ email: accEmail, role: "narrator", profileTable: "narrators", profileId: edit.id });
      }
    } else {
      if (createAccount) {
        const result = await createCreatorWithAccount({
          email: accEmail, password: accPassword, confirmPassword: accConfirm,
          role: "narrator", profileTable: "narrators", profileData: payload,
        });
        if (!result) return;
      } else {
        const { error } = await supabase.from("narrators").insert(payload);
        if (error) { toast.error(error.message); return; }
      }
    }

    toast.success("Saved"); setOpen(false); load();
  };

  const remove = async (id: string) => { if (!confirm("Delete?")) return; await supabase.from("narrators").delete().eq("id", id); toast.success("Deleted"); load(); };

  const handleToggle = (n: any) => {
    if (n.status === "active") { setDeactivateTarget(n); }
    else { supabase.from("narrators").update({ status: "active" }).eq("id", n.id).then(() => { toast.success("Activated"); load(); }); }
  };

  const deactivateItem = async (item: any, reason: string, type: string) => {
    await supabase.from("narrators").update({ status: "inactive" }).eq("id", item.id);
    await supabase.from("admin_activity_logs").insert({
      user_id: (await supabase.auth.getUser()).data.user?.id || "",
      action: `Narrator deactivated (${type})`, details: reason || "No reason provided",
      target_type: "narrator", target_id: item.id, module: "narrators",
      risk_level: type === "permanent" ? "high" : "medium",
    });
    setDeactivateTarget(null); toast.success("Deactivated"); load();
  };

  const toggleSelect = (id: string) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); };

  const bulkSetStatus = async (status: string) => {
    const ids = Array.from(selected);
    if (!ids.length || !confirm(`${status === "active" ? "Activate" : "Deactivate"} ${ids.length} narrator(s)?`)) return;
    for (const id of ids) await supabase.from("narrators").update({ status }).eq("id", id);
    setSelected(new Set()); toast.success(`${ids.length} narrator(s) updated`); load();
  };

  const filtered = items.filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (n.name || "").toLowerCase().includes(q) || (n.name_en || "").toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Narrators</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Narrator</Button>
      </div>
      <div className="mb-4">
        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search narrators..." className="max-w-sm" />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/40 mb-4">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkSetStatus("active")}>Activate All</Button>
          <Button size="sm" variant="destructive" onClick={() => bulkSetStatus("inactive")}>Deactivate All</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={() => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map(n => n.id)))} /></TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((n) => (
              <TableRow key={n.id}>
                <TableCell><Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggleSelect(n.id)} /></TableCell>
                <TableCell><Avatar className="h-8 w-8"><AvatarImage src={n.avatar_url || undefined} /><AvatarFallback className="bg-secondary text-muted-foreground text-xs"><User className="h-3.5 w-3.5" /></AvatarFallback></Avatar></TableCell>
                <TableCell className="font-medium">{n.name}</TableCell>
                <TableCell>{n.specialty || "—"}</TableCell>
                <TableCell>{n.priority}</TableCell>
                <TableCell><span className={`text-xs ${n.user_id ? "text-green-600" : "text-muted-foreground"}`}>{n.user_id ? "✓ Linked" : "—"}</span></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={n.status === "active"} onCheckedChange={() => handleToggle(n)} />
                    <StatusBadge status={n.status || "active"} />
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/user/narrator/${n.id}`)}><Eye className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(n)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(n.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No narrators</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit ? "Edit Narrator" : "Add Narrator"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <AvatarUpload currentUrl={form.avatar_url} onUrlChange={(url) => setForm({ ...form, avatar_url: url })} folder="narrators" label="Narrator Photo" />
            <div><Label>Name (Bengali)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Name (English)</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div><Label>Specialty</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
            <div><Label>Rating</Label><Input type="number" step="0.1" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} /></div>
            <div><Label>Priority</Label><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
            <div><Label>Phone</Label><Input type="tel" placeholder="+880XXXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />Featured</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_trending} onChange={(e) => setForm({ ...form, is_trending: e.target.checked })} />Trending</label>

            {edit ? (
              <CreatorAccountCard
                profileId={edit.id}
                profileName={edit.name}
                profileTable="narrators"
                creatorRole="narrator"
                userId={edit.user_id}
                onLinkChanged={() => load()}
              />
            ) : (
              <CreatorAccountFields
                isEdit={false}
                hasExistingUserId={false}
                createAccount={createAccount}
                onCreateAccountChange={setCreateAccount}
                email={accEmail}
                onEmailChange={setAccEmail}
                password={accPassword}
                onPasswordChange={setAccPassword}
                confirmPassword={accConfirm}
                onConfirmPasswordChange={setAccConfirm}
              />
            )}

            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeactivateModal open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }} itemName={deactivateTarget?.name || "Narrator"} onConfirm={(reason, type) => deactivateTarget && deactivateItem(deactivateTarget, reason, type)} />
    </div>
  );
}
