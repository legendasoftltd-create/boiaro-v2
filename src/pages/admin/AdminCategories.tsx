import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function AdminCategories() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ name: "", name_bn: "", name_en: "", slug: "", icon: "", color: "", priority: 0, is_featured: false, is_trending: false });

  const load = async () => {
    const { data } = await supabase.from("categories").select("*").order("priority", { ascending: true }).order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEdit(null); setForm({ name: "", name_bn: "", name_en: "", slug: "", icon: "", color: "", priority: 0, is_featured: false, is_trending: false }); setOpen(true); };
  const openEdit = (c: any) => { setEdit(c); setForm({ name: c.name, name_bn: c.name_bn || "", name_en: c.name_en || "", slug: c.slug || "", icon: c.icon || "", color: c.color || "", priority: c.priority || 0, is_featured: c.is_featured || false, is_trending: c.is_trending || false }); setOpen(true); };

  const save = async () => {
    const autoSlug = form.slug || (form.name_en || form.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const payload = { ...form, priority: Number(form.priority) || 0, slug: autoSlug, name_en: form.name_en || form.name };
    if (edit) {
      const { error } = await supabase.from("categories").update(payload).eq("id", edit.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("categories").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved"); setOpen(false); load();
  };

  const remove = async (id: string) => { if (!confirm("Delete?")) return; await supabase.from("categories").delete().eq("id", id); toast.success("Deleted"); load(); };

  const toggleStatus = async (c: any) => {
    const newStatus = c.status === "active" ? "inactive" : "active";
    await supabase.from("categories").update({ status: newStatus }).eq("id", c.id);
    toast.success(newStatus === "active" ? "Activated" : "Deactivated");
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Categories</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Category</Button>
      </div>
      <div className=" border">
        <Table>
          <TableHeader><TableRow><TableHead className="text-white">Bengali Name</TableHead><TableHead className="text-white">English</TableHead><TableHead className="text-white">Slug</TableHead><TableHead className="text-white">Priority</TableHead><TableHead className="text-white">Featured</TableHead><TableHead className="text-white">Trending</TableHead><TableHead className="text-white">Active</TableHead><TableHead className="text-right text-white">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name_bn || c.name}</TableCell>
                <TableCell>{c.name_en || c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.slug || "—"}</TableCell>
                <TableCell>{c.priority}</TableCell>
                <TableCell>{c.is_featured ? "✓" : "—"}</TableCell>
                <TableCell>{c.is_trending ? "✓" : "—"}</TableCell>
                <TableCell><Switch checked={c.status === "active"} onCheckedChange={() => toggleStatus(c)} /></TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No categories</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Bengali Name (Primary)</Label><Input value={form.name_bn} onChange={(e) => setForm({ ...form, name_bn: e.target.value })} /></div>
            <div><Label>English Name</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div><Label>Internal Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Same as English (legacy)" /></div>
            <div><Label>Slug (auto-generated)</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto from english name" /></div>
            <div><Label>Icon (emoji/class)</Label><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
            <div><Label>Color</Label><Input type="color" value={form.color || "#000000"} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
            <div><Label>Priority</Label><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />Featured</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_trending} onChange={(e) => setForm({ ...form, is_trending: e.target.checked })} />Trending</label>
            <Button className="w-full" onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
