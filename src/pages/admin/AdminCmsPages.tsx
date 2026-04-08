import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Search, FileText } from "lucide-react";

interface CmsPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  featured_image: string | null;
  status: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminCmsPages() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", slug: "", content: "", featured_image: "", status: "draft",
    seo_title: "", seo_description: "", seo_keywords: "",
  });

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["cms-pages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cms_pages").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as CmsPage[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (f: typeof form & { id?: string }) => {
      const payload = { ...f, featured_image: f.featured_image || null, seo_title: f.seo_title || null, seo_description: f.seo_description || null, seo_keywords: f.seo_keywords || null };
      if (f.id) {
        const { error } = await supabase.from("cms_pages").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cms_pages").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cms-pages"] });
      setIsOpen(false);
      toast({ title: "Page saved" });
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", slug: "", content: "", featured_image: "", status: "draft", seo_title: "", seo_description: "", seo_keywords: "" });
    setIsOpen(true);
  };

  const openEdit = (p: CmsPage) => {
    setEditing(p);
    setForm({
      title: p.title, slug: p.slug, content: p.content, featured_image: p.featured_image || "",
      status: p.status, seo_title: p.seo_title || "", seo_description: p.seo_description || "", seo_keywords: p.seo_keywords || "",
    });
    setIsOpen(true);
  };

  const filtered = pages.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-primary">Page Management</h1>
          <p className="text-sm text-muted-foreground">Manage static pages</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Page</Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border/40 bg-card/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No pages found</TableCell></TableRow>
            ) : filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />{p.title}</TableCell>
                <TableCell className="text-muted-foreground">/{p.slug}</TableCell>
                <TableCell><Badge variant={p.status === "published" ? "default" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-xs">{new Date(p.updated_at).toLocaleDateString()}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Page" : "New Page"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Title</label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Slug</label><Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm font-medium">Content (HTML)</label><Textarea rows={10} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Featured Image URL</label><Input value={form.featured_image} onChange={e => setForm(f => ({ ...f, featured_image: e.target.value }))} /></div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="border-t border-border/40 pt-4">
              <h3 className="text-sm font-semibold mb-3">SEO Settings</h3>
              <div className="space-y-3">
                <div><label className="text-sm font-medium">SEO Title</label><Input value={form.seo_title} onChange={e => setForm(f => ({ ...f, seo_title: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Meta Description</label><Textarea rows={2} value={form.seo_description} onChange={e => setForm(f => ({ ...f, seo_description: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Keywords</label><Input value={form.seo_keywords} onChange={e => setForm(f => ({ ...f, seo_keywords: e.target.value }))} /></div>
              </div>
            </div>
            <Button className="w-full" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ ...form, id: editing?.id })}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
