import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Search, Trash2, BookOpen } from "lucide-react";

interface BlogPost {
  id: string; title: string; slug: string; cover_image: string | null; excerpt: string | null;
  content: string; author_name: string | null; category: string | null; tags: string[] | null;
  publish_date: string | null; status: string; is_featured: boolean | null;
  seo_title: string | null; seo_description: string | null; seo_keywords: string | null;
  created_at: string; updated_at: string;
}

const emptyForm = {
  title: "", slug: "", cover_image: "", excerpt: "", content: "", author_name: "", category: "",
  tags: "", publish_date: "", status: "draft", is_featured: false,
  seo_title: "", seo_description: "", seo_keywords: "",
};

export default function AdminBlog() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as BlogPost[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (f: typeof form & { id?: string }) => {
      const payload = {
        title: f.title, slug: f.slug, content: f.content, status: f.status, is_featured: f.is_featured,
        cover_image: f.cover_image || null, excerpt: f.excerpt || null, author_name: f.author_name || null,
        category: f.category || null, tags: f.tags ? f.tags.split(",").map(t => t.trim()) : [],
        publish_date: f.publish_date || null,
        seo_title: f.seo_title || null, seo_description: f.seo_description || null, seo_keywords: f.seo_keywords || null,
      };
      if (f.id) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blog_posts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blog-posts"] }); setIsOpen(false); toast({ title: "Article saved" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blog-posts"] }); toast({ title: "Deleted" }); },
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setIsOpen(true); };
  const openEdit = (p: BlogPost) => {
    setEditing(p);
    setForm({
      title: p.title, slug: p.slug, cover_image: p.cover_image || "", excerpt: p.excerpt || "",
      content: p.content, author_name: p.author_name || "", category: p.category || "",
      tags: (p.tags || []).join(", "), publish_date: p.publish_date?.split("T")[0] || "",
      status: p.status, is_featured: p.is_featured || false,
      seo_title: p.seo_title || "", seo_description: p.seo_description || "", seo_keywords: p.seo_keywords || "",
    });
    setIsOpen(true);
  };

  const filtered = posts.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-primary">Blog / Articles</h1>
          <p className="text-sm text-muted-foreground">Manage blog posts</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Article</Button>
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
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No articles found</TableCell></TableRow>
            ) : filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />{p.title}</TableCell>
                <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                <TableCell><Badge variant={p.status === "published" ? "default" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</Badge></TableCell>
                <TableCell>{p.is_featured ? <Badge className="bg-primary/20 text-primary">Featured</Badge> : "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{p.publish_date ? new Date(p.publish_date).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this article?")) deleteMutation.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Article" : "New Article"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Title</label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Slug</label><Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm font-medium">Excerpt</label><Textarea rows={2} value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} /></div>
            <div><label className="text-sm font-medium">Content (HTML)</label><Textarea rows={10} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Cover Image URL</label><Input value={form.cover_image} onChange={e => setForm(f => ({ ...f, cover_image: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Author</label><Input value={form.author_name} onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-sm font-medium">Category</label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Tags (comma separated)</label><Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Publish Date</label><Input type="date" value={form.publish_date} onChange={e => setForm(f => ({ ...f, publish_date: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={form.is_featured} onCheckedChange={v => setForm(f => ({ ...f, is_featured: v }))} />
                <span className="text-sm">Featured</span>
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
