import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";
import { toMediaUrl } from "@/lib/mediaUrl";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const ACCEPTED = ".jpg,.jpeg,.png,.webp,.svg";
const MAX_SIZE = 5 * 1024 * 1024;

function CategoryIconUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayUrl = preview || (value ? toMediaUrl(value) : null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";

    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type)) {
      toast.error("Only JPG, PNG, WebP, or SVG images allowed");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image must be under 5 MB");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Upload failed: " + (err.error || res.statusText));
        setPreview(null);
        URL.revokeObjectURL(previewUrl);
        return;
      }

      const { url, storage } = await res.json();
      onChange(url);
      setPreview(null);
      URL.revokeObjectURL(previewUrl);
      toast.success(`Icon uploaded via ${storage === "s3" ? "S3" : "local storage"}`);
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    if (preview) { URL.revokeObjectURL(preview); setPreview(null); }
    onChange("");
  };

  return (
    <div className="space-y-2">
      <Label>Category Icon / Image</Label>
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 rounded-xl border-2 border-dashed border-border bg-secondary/30 flex items-center justify-center overflow-hidden shrink-0">
          {displayUrl ? (
            <img src={displayUrl} alt="icon" className="w-full h-full object-contain p-1" />
          ) : (
            <ImageIcon className="w-7 h-7 text-muted-foreground/50" />
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-xl">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Uploading…" : displayUrl ? "Change" : "Upload"}
            </Button>
            {displayUrl && (
              <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={uploading}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP, SVG · max 5 MB</p>
          <p className="text-[10px] text-muted-foreground/60">S3 if configured, otherwise local (auto-syncs to S3 when available)</p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFile} />
      <Input
        placeholder="Or paste image URL…"
        value={value}
        onChange={(e) => { if (preview) { URL.revokeObjectURL(preview); setPreview(null); } onChange(e.target.value); }}
        className="text-xs h-8"
      />
    </div>
  );
}

export default function AdminCategories() {
  const utils = trpc.useUtils();
  const { dialog: confirmDialog, openConfirm } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({
    name: "", name_bn: "", name_en: "", slug: "", icon: "", color: "", priority: 0, is_featured: false, is_trending: false,
  });

  const { data: items = [] } = trpc.admin.listCategories.useQuery();

  const createMutation = trpc.admin.createCategoryFull.useMutation({
    onSuccess: () => { utils.admin.listCategories.invalidate(); setOpen(false); toast.success("Category created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.admin.updateCategoryFull.useMutation({
    onSuccess: () => { utils.admin.listCategories.invalidate(); setOpen(false); toast.success("Category updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.admin.deleteCategory.useMutation({
    onSuccess: () => { utils.admin.listCategories.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const toggleStatusMutation = trpc.admin.updateCategoryFull.useMutation({
    onSuccess: () => utils.admin.listCategories.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => {
    setEdit(null);
    setForm({ name: "", name_bn: "", name_en: "", slug: "", icon: "", color: "", priority: 0, is_featured: false, is_trending: false });
    setOpen(true);
  };
  const openEdit = (c: any) => {
    setEdit(c);
    setForm({ name: c.name, name_bn: c.name_bn || "", name_en: c.name_en || "", slug: c.slug || "", icon: c.icon || "", color: c.color || "", priority: c.priority || 0, is_featured: c.is_featured || false, is_trending: c.is_trending || false });
    setOpen(true);
  };

  const save = () => {
    const autoSlug = form.slug || (form.name_en || form.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const payload = { ...form, priority: Number(form.priority) || 0, slug: autoSlug, name_en: form.name_en || form.name };
    if (edit) updateMutation.mutate({ id: edit.id, ...payload });
    else createMutation.mutate(payload);
  };

  const remove = (id: string) => {
    openConfirm({
      message: "Are you sure you want to delete this category?",
      onConfirm: () => deleteMutation.mutate({ id }),
    });
  };

  const toggleStatus = (c: any) => {
    const newStatus = c.status === "active" ? "inactive" : "active";
    toggleStatusMutation.mutate({ id: c.id, status: newStatus });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Category</Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Icon</TableHead>
              <TableHead>Bengali Name</TableHead>
              <TableHead>English</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Trending</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>
                  {c.icon && (c.icon.startsWith("/") || c.icon.startsWith("http")) ? (
                    <img src={toMediaUrl(c.icon)} alt="" className="w-8 h-8 object-contain rounded" />
                  ) : (
                    <span className="text-lg">{c.icon || "—"}</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">{c.name_bn || c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.name_en || c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.slug || "—"}</TableCell>
                <TableCell>{c.priority}</TableCell>
                <TableCell>{c.is_featured ? "✓" : "—"}</TableCell>
                <TableCell>{c.is_trending ? "✓" : "—"}</TableCell>
                <TableCell>
                  <Switch checked={c.status === "active"} onCheckedChange={() => toggleStatus(c)} />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No categories</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <CategoryIconUpload value={form.icon} onChange={(url) => setForm({ ...form, icon: url })} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Bengali Name (Primary)</Label>
                <Input value={form.name_bn} onChange={(e) => setForm({ ...form, name_bn: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">English Name</Label>
                <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Internal Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Same as English" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Slug (auto-generated)</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto from english" className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={form.color || "#6366f1"} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-10 h-9 rounded border border-border cursor-pointer" />
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#6366f1" className="flex-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="mt-1" />
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_trending} onChange={(e) => setForm({ ...form, is_trending: e.target.checked })} />
                Trending
              </label>
            </div>

            <Button className="w-full" onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save Category"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
