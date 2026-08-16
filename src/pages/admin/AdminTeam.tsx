import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AvatarUpload } from "@/components/admin/AvatarUpload";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

const emptyForm = {
  name: "", role_title: "", photo_url: "", bio: "",
  facebook_url: "", linkedin_url: "", twitter_url: "",
  sort_order: 0, status: "active",
};

export default function AdminTeam() {
  const utils = trpc.useUtils();
  const { dialog: confirmDialog, openConfirm } = useConfirmDialog();
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: members = [], isLoading } = trpc.admin.listTeamMembers.useQuery();

  const updateMutation = trpc.admin.updateTeamMember.useMutation({
    onSuccess: () => { utils.admin.listTeamMembers.invalidate(); setIsOpen(false); toast.success("Team member saved"); },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.admin.createTeamMember.useMutation({
    onSuccess: () => { utils.admin.listTeamMembers.invalidate(); setIsOpen(false); toast.success("Team member saved"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.deleteTeamMember.useMutation({
    onSuccess: () => { utils.admin.listTeamMembers.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => { setEditId(undefined); setForm({ ...emptyForm, sort_order: members.length }); setIsOpen(true); };
  const openEdit = (m: any) => {
    setEditId(m.id);
    setForm({
      name: m.name, role_title: m.role_title, photo_url: m.photo_url || "", bio: m.bio || "",
      facebook_url: m.facebook_url || "", linkedin_url: m.linkedin_url || "", twitter_url: m.twitter_url || "",
      sort_order: m.sort_order, status: m.status,
    });
    setIsOpen(true);
  };

  const handleSave = () => {
    const payload = {
      name: form.name, role_title: form.role_title, status: form.status, sort_order: Number(form.sort_order) || 0,
      photo_url: form.photo_url || undefined, bio: form.bio || undefined,
      facebook_url: form.facebook_url || undefined, linkedin_url: form.linkedin_url || undefined,
      twitter_url: form.twitter_url || undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-primary">Team &amp; Management</h1>
          <p className="text-sm text-muted-foreground">Shown on the website's "BoiAro টিম ও ম্যানেজমেন্ট" page</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Member</Button>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : members.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No team members yet</TableCell></TableRow>
            ) : members.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />{m.name}</TableCell>
                <TableCell className="text-muted-foreground">{m.role_title}</TableCell>
                <TableCell><Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status === "active" ? "Active" : "Hidden"}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-xs">{m.sort_order}</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => openConfirm({ message: "Are you sure you want to remove this team member?", onConfirm: () => deleteMutation.mutate({ id: m.id }) })}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Team Member" : "New Team Member"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Name</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Role / Title</label><Input value={form.role_title} onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))} placeholder="e.g. Founder & CEO" /></div>
            </div>
            <AvatarUpload currentUrl={form.photo_url} onUrlChange={url => setForm(f => ({ ...f, photo_url: url }))} label="Photo" />
            <div><label className="text-sm font-medium">Bio</label><Textarea rows={4} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-sm font-medium">Facebook URL</label><Input value={form.facebook_url} onChange={e => setForm(f => ({ ...f, facebook_url: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">LinkedIn URL</label><Input value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Twitter/X URL</label><Input value={form.twitter_url} onChange={e => setForm(f => ({ ...f, twitter_url: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-6">
              <div><label className="text-sm font-medium">Display Order</label><Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="w-28" /></div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={form.status === "active"} onCheckedChange={v => setForm(f => ({ ...f, status: v ? "active" : "hidden" }))} />
                <span className="text-sm">Visible on website</span>
              </div>
            </div>
            <Button className="w-full" disabled={updateMutation.isPending || createMutation.isPending} onClick={handleSave}>
              {(updateMutation.isPending || createMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
