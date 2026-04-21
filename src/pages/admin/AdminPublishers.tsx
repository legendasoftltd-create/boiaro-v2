import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Pencil, Trash2, Eye, Building2 } from "lucide-react";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { AvatarUpload } from "@/components/admin/AvatarUpload";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeactivateModal } from "@/components/admin/DeactivateModal";
import { CreatorAccountCard } from "@/components/admin/CreatorAccountCard";
import { CreatorAccountFields } from "@/components/admin/CreatorAccountFields";
import { useCreatorAccount } from "@/hooks/useCreatorAccount";
import { toast } from "sonner";

const EMPTY_FORM = { name: "", name_en: "", description: "", logo_url: "", is_featured: false, is_verified: false, priority: 0, phone: "", email: "" };

export default function AdminPublishers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null);
  const [createAccount, setCreateAccount] = useState(false);
  const [accEmail, setAccEmail] = useState("");
  const [accPassword, setAccPassword] = useState("");
  const [accConfirm, setAccConfirm] = useState("");
  const { createCreatorWithAccount, linkExistingProfile, saving: accountSaving } = useCreatorAccount();

  const utils = trpc.useUtils();
  const { data: items = [], isLoading, error } = trpc.admin.listPublishers.useQuery({ search: search || undefined });
  const createMutation = trpc.admin.createPublisher.useMutation({ onSuccess: () => utils.admin.listPublishers.invalidate() });
  const updateMutation = trpc.admin.updatePublisher.useMutation({ onSuccess: () => utils.admin.listPublishers.invalidate() });
  const deleteMutation = trpc.admin.deletePublisher.useMutation({ onSuccess: () => utils.admin.listPublishers.invalidate() });

  const resetAccountFields = () => { setCreateAccount(false); setAccEmail(""); setAccPassword(""); setAccConfirm(""); };
  const openNew = () => { setEdit(null); setForm(EMPTY_FORM); resetAccountFields(); setOpen(true); };
  const openEdit = (a: any) => {
    setEdit(a);
    setForm({ name: a.name, name_en: a.name_en || "", description: a.description || "", logo_url: a.logo_url || "", is_featured: a.is_featured || false, is_verified: a.is_verified || false, priority: a.priority || 0, phone: a.phone || "", email: a.email || "" });
    resetAccountFields();
    setOpen(true);
  };

  const save = async () => {
    const payload = { ...form, priority: Number(form.priority) || 0 };
    if (edit) {
      await updateMutation.mutateAsync({ id: edit.id, ...payload });
      if (createAccount && !edit.user_id && accEmail) {
        await linkExistingProfile({ email: accEmail, role: "publisher", profileTable: "publishers", profileId: edit.id });
      }
    } else {
      if (createAccount) {
        const result = await createCreatorWithAccount({ email: accEmail, password: accPassword, confirmPassword: accConfirm, role: "publisher", profileTable: "publishers", profileData: payload });
        if (!result) return;
      } else {
        await createMutation.mutateAsync(payload as any);
      }
    }
    toast.success("Saved");
    setOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Deleted");
  };

  const handleToggle = async (a: any) => {
    if (a.status === "active") { setDeactivateTarget(a); }
    else { await updateMutation.mutateAsync({ id: a.id, status: "active" }); toast.success("Activated"); }
  };

  const deactivateItem = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
    setDeactivateTarget(null);
    toast.success("Deactivated");
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const bulkSetStatus = async (status: string) => {
    const ids = Array.from(selected);
    if (!ids.length || !confirm(`${status === "active" ? "Activate" : "Deactivate"} ${ids.length} publisher(s)?`)) return;
    for (const id of ids) await updateMutation.mutateAsync({ id, status });
    setSelected(new Set());
    toast.success(`${ids.length} publisher(s) updated`);
  };

  const saving = createMutation.isPending || updateMutation.isPending || accountSaving;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Publishers</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Publisher</Button>
      </div>
      <div className="mb-4">
        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search publishers..." className="max-w-sm" />
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
              <TableHead className="w-10">
                <Checkbox checked={items.length > 0 && selected.size === items.length} onCheckedChange={() => selected.size === items.length ? setSelected(new Set()) : setSelected(new Set(items.map((a: any) => a.id)))} />
              </TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
            {!isLoading && error && <TableRow><TableCell colSpan={8} className="text-center text-destructive py-8">Error: {error.message}</TableCell></TableRow>}
            {!isLoading && !error && items.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No publishers</TableCell></TableRow>}
            {items.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} /></TableCell>
                <TableCell><Avatar className="h-8 w-8"><AvatarImage src={a.logo_url || undefined} /><AvatarFallback className="bg-secondary text-muted-foreground text-xs"><Building2 className="h-3.5 w-3.5" /></AvatarFallback></Avatar></TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{a.email || "—"}</TableCell>
                <TableCell>{a.priority}</TableCell>
                <TableCell>{a.is_verified ? <span className="text-xs text-green-600">✓ Verified</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.status === "active"} onCheckedChange={() => handleToggle(a)} />
                    <StatusBadge status={a.status || "active"} />
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/user/publisher/${a.id}`)}><Eye className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit ? "Edit Publisher" : "Add Publisher"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <AvatarUpload currentUrl={form.logo_url} onUrlChange={(url) => setForm({ ...form, logo_url: url })} folder="publishers" label="Publisher Logo" />
            <div><Label>Name (Bengali)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Name (English)</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Priority</Label><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />Featured</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_verified} onChange={(e) => setForm({ ...form, is_verified: e.target.checked })} />Verified</label>

            {edit ? (
              <CreatorAccountCard profileId={edit.id} profileName={edit.name} profileTable="publishers" creatorRole="publisher" userId={edit.user_id} onLinkChanged={() => utils.admin.listPublishers.invalidate()} />
            ) : (
              <CreatorAccountFields isEdit={false} hasExistingUserId={false} createAccount={createAccount} onCreateAccountChange={setCreateAccount} email={accEmail} onEmailChange={setAccEmail} password={accPassword} onPasswordChange={setAccPassword} confirmPassword={accConfirm} onConfirmPasswordChange={setAccConfirm} />
            )}

            <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeactivateModal open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }} itemName={deactivateTarget?.name || "Publisher"} onConfirm={() => deactivateTarget && deactivateItem(deactivateTarget)} />
    </div>
  );
}
