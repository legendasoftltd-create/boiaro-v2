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

export default function AdminAuthors() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ name: "", name_en: "", bio: "", genre: "", avatar_url: "", is_featured: false, is_trending: false, priority: 0, phone: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null);

  // Account creation fields
  const [createAccount, setCreateAccount] = useState(false);
  const [accEmail, setAccEmail] = useState("");
  const [accPassword, setAccPassword] = useState("");
  const [accConfirm, setAccConfirm] = useState("");
  const { createCreatorWithAccount, linkExistingProfile, saving } = useCreatorAccount();

  const load = async () => {
    const { data } = await supabase.rpc("admin_get_authors" as any);
    setItems((data as any[]) || []);
  };
  useEffect(() => { load(); }, []);

  const resetAccountFields = () => { setCreateAccount(false); setAccEmail(""); setAccPassword(""); setAccConfirm(""); };

  const openNew = () => { setEdit(null); setForm({ name: "", name_en: "", bio: "", genre: "", avatar_url: "", is_featured: false, is_trending: false, priority: 0, phone: "" }); resetAccountFields(); setOpen(true); };
  const openEdit = (a: any) => { setEdit(a); setForm({ name: a.name, name_en: a.name_en || "", bio: a.bio || "", genre: a.genre || "", avatar_url: a.avatar_url || "", is_featured: a.is_featured || false, is_trending: a.is_trending || false, priority: a.priority || 0, phone: a.phone || "" }); resetAccountFields(); setOpen(true); };

  const save = async () => {
    const payload = { ...form, priority: Number(form.priority) || 0 };

    if (edit) {
      // Editing existing
      const { error } = await supabase.from("authors").update(payload).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }

      // Link account for existing unlinked profile
      if (createAccount && !edit.user_id && accEmail) {
        await linkExistingProfile({ email: accEmail, role: "writer", profileTable: "authors", profileId: edit.id });
      }
    } else {
      // New entry
      if (createAccount) {
        const result = await createCreatorWithAccount({
          email: accEmail, password: accPassword, confirmPassword: accConfirm,
          role: "writer", profileTable: "authors", profileData: payload,
        });
        if (!result) return;
      } else {
        const { error } = await supabase.from("authors").insert(payload);
        if (error) { toast.error(error.message); return; }
      }
    }

    toast.success("Saved"); setOpen(false); load();
  };

  const remove = async (id: string) => { if (!confirm("Delete?")) return; await supabase.from("authors").delete().eq("id", id); toast.success("Deleted"); load(); };

  const handleToggle = (a: any) => {
    if (a.status === "active") { setDeactivateTarget(a); }
    else { supabase.from("authors").update({ status: "active" }).eq("id", a.id).then(() => { toast.success("Activated"); load(); }); }
  };

  const deactivateItem = async (item: any, reason: string, type: string) => {
    await supabase.from("authors").update({ status: "inactive" }).eq("id", item.id);
    await supabase.from("admin_activity_logs").insert({
      user_id: (await supabase.auth.getUser()).data.user?.id || "",
      action: `Author deactivated (${type})`, details: reason || "No reason provided",
      target_type: "author", target_id: item.id, module: "authors",
      risk_level: type === "permanent" ? "high" : "medium",
    });
    setDeactivateTarget(null); toast.success("Deactivated"); load();
  };

  const toggleSelect = (id: string) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); };

  const bulkSetStatus = async (status: string) => {
    const ids = Array.from(selected);
    if (!ids.length || !confirm(`${status === "active" ? "Activate" : "Deactivate"} ${ids.length} author(s)?`)) return;
    for (const id of ids) await supabase.from("authors").update({ status }).eq("id", id);
    setSelected(new Set()); toast.success(`${ids.length} author(s) ${status === "active" ? "activated" : "deactivated"}`); load();
  };

  const filtered = items.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (a.name || "").toLowerCase().includes(q) || (a.name_en || "").toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Authors</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Author</Button>
      </div>
      <div className="mb-4">
        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search authors..." className="max-w-sm" />
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
              <TableHead className="w-10"><Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={() => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map(a => a.id)))} /></TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Genre</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a) => (
              <TableRow key={a.id}>
                <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} /></TableCell>
                <TableCell><Avatar className="h-8 w-8"><AvatarImage src={a.avatar_url || undefined} /><AvatarFallback className="bg-secondary text-muted-foreground text-xs"><User className="h-3.5 w-3.5" /></AvatarFallback></Avatar></TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>{a.genre || "—"}</TableCell>
                <TableCell>{a.priority}</TableCell>
                <TableCell>
                  {a.user_id ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">✓ Linked <span className="text-muted-foreground font-mono">{a.user_id.slice(0, 6)}..</span></span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.status === "active"} onCheckedChange={() => handleToggle(a)} />
                    <StatusBadge status={a.status || "active"} />
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/user/author/${a.id}`)}><Eye className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No authors</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit ? "Edit Author" : "Add Author"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <AvatarUpload currentUrl={form.avatar_url} onUrlChange={(url) => setForm({ ...form, avatar_url: url })} folder="authors" label="Author Photo" />
            <div><Label>Name (Bengali)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Name (English)</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div><Label>Genre</Label><Input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} /></div>
            <div><Label>Priority</Label><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
            <div><Label>Phone</Label><Input type="tel" placeholder="+880XXXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />Featured</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_trending} onChange={(e) => setForm({ ...form, is_trending: e.target.checked })} />Trending</label>

            {edit ? (
              <CreatorAccountCard
                profileId={edit.id}
                profileName={edit.name}
                profileTable="authors"
                creatorRole="writer"
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

      <DeactivateModal open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }} itemName={deactivateTarget?.name || "Author"} onConfirm={(reason, type) => deactivateTarget && deactivateItem(deactivateTarget, reason, type)} />
    </div>
  );
}
