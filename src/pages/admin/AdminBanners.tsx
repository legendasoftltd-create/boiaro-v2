import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Image } from "lucide-react";

const emptyForm = { title: "", subtitle: "", cta_text: "", cta_link: "", image_url: "", is_active: true, sort_order: 0 };

export default function AdminBanners() {
  const utils = trpc.useUtils();
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: banners = [], isLoading } = trpc.admin.listHeroBanners.useQuery();

  const saveMutation = trpc.admin.upsertHeroBanner.useMutation({
    onSuccess: () => { utils.admin.listHeroBanners.invalidate(); setIsOpen(false); toast.success("Banner saved"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.deleteHeroBanner.useMutation({
    onSuccess: () => { utils.admin.listHeroBanners.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => { setEditId(undefined); setForm(emptyForm); setIsOpen(true); };
  const openEdit = (b: any) => {
    setEditId(b.id);
    setForm({ title: b.title, subtitle: b.subtitle || "", cta_text: b.cta_text || "", cta_link: b.cta_link || "", image_url: b.image_url || "", is_active: b.is_active, sort_order: b.sort_order });
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-primary">Hero Banners</h1>
          <p className="text-sm text-muted-foreground">Manage homepage banners</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Banner</Button>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>CTA</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : banners.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No banners</TableCell></TableRow>
            ) : banners.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium flex items-center gap-2"><Image className="h-4 w-4 text-primary" />{b.title}</TableCell>
                <TableCell className="text-muted-foreground">{b.cta_text || "—"}</TableCell>
                <TableCell>{b.sort_order}</TableCell>
                <TableCell><Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteMutation.mutate({ id: b.id }); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Edit Banner" : "New Banner"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Title</label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><label className="text-sm font-medium">Subtitle</label><Input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">CTA Text</label><Input value={form.cta_text} onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">CTA Link</label><Input value={form.cta_link} onChange={e => setForm(f => ({ ...f, cta_link: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm font-medium">Image URL</label><Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} /></div>
            <div className="flex items-center gap-6">
              <div><label className="text-sm font-medium">Order</label><Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className="w-20" /></div>
              <div className="flex items-center gap-2 pt-5"><Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} /><span className="text-sm">Active</span></div>
            </div>
            <Button className="w-full" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ ...form, id: editId, subtitle: form.subtitle || null, cta_text: form.cta_text || null, cta_link: form.cta_link || null, image_url: form.image_url || null })}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
