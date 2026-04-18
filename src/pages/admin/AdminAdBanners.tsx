import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ImageIcon, Plus, Search, Trash2, Eye, MousePointerClick } from "lucide-react";
import { toast } from "sonner";

interface AdBanner {
  id: string;
  title: string | null;
  image_url: string | null;
  destination_url: string | null;
  placement_key: string;
  start_date: string;
  end_date: string | null;
  status: string;
  display_order: number;
  impressions: number;
  clicks: number;
  device: string;
}

const PLACEMENTS = [
  "homepage_banner", "book_details", "before_reading", "before_audiobook",
  "dashboard", "wallet_page", "reward_center",
];

export default function AdminAdBanners() {
  const [banners, setBanners] = useState<AdBanner[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Partial<AdBanner>>({});
  const [editId, setEditId] = useState<string | null>(null);

  const fetchBanners = async () => {
    const { data } = await supabase.from("ad_banners" as any).select("*").order("display_order");
    setBanners((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchBanners(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ status: "active", placement_key: "homepage_banner", device: "both", display_order: 0 });
    setFormOpen(true);
  };

  const openEdit = (b: AdBanner) => {
    setEditId(b.id);
    setForm({ ...b });
    setFormOpen(true);
  };

  const save = async () => {
    const payload = {
      title: form.title || null,
      image_url: form.image_url || null,
      destination_url: form.destination_url || null,
      placement_key: form.placement_key || "homepage_banner",
      status: form.status || "active",
      display_order: form.display_order || 0,
      device: form.device || "both",
      start_date: form.start_date || new Date().toISOString(),
      end_date: form.end_date || null,
      updated_at: new Date().toISOString(),
    };

    if (editId) {
      const { error } = await supabase.from("ad_banners" as any).update(payload).eq("id", editId);
      if (error) { toast.error(error.message); return; }
      toast.success("Banner updated");
    } else {
      const { error } = await supabase.from("ad_banners" as any).insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Banner created");
    }
    setFormOpen(false);
    fetchBanners();
  };

  const deleteBanner = async (id: string) => {
    await supabase.from("ad_banners" as any).delete().eq("id", id);
    toast.success("Banner deleted");
    fetchBanners();
  };

  const filtered = banners.filter(b =>
    !search || (b.title || "").toLowerCase().includes(search.toLowerCase()) || b.placement_key.includes(search)
  );

  const statusBadge = (s: string) => {
    const c: Record<string, string> = {
      active: "bg-emerald-500/20 text-emerald-400",
      inactive: "bg-secondary text-muted-foreground",
      expired: "bg-red-500/20 text-red-400",
    };
    return <Badge className={c[s] || "bg-secondary"}>{s}</Badge>;
  };

  const ctr = (impressions: number, clicks: number) =>
    impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) + "%" : "0%";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Ad Banners</h1>
          <p className="text-muted-foreground text-sm">Manage banner advertisements</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" />New Banner</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search banners..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="border-border/30">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Banner</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"><Eye className="w-3.5 h-3.5 inline" /> Impr.</TableHead>
              <TableHead className="text-right"><MousePointerClick className="w-3.5 h-3.5 inline" /> Clicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No banners</TableCell></TableRow>
            ) : filtered.map(b => (
              <TableRow key={b.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {b.image_url ? (
                      <img src={b.image_url} className="w-16 h-10 rounded object-cover border border-border/30" alt="" />
                    ) : (
                      <div className="w-16 h-10 rounded bg-secondary/60 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>
                    )}
                    <p className="text-sm font-medium">{b.title || "Untitled"}</p>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[11px]">{b.placement_key}</Badge></TableCell>
                <TableCell>{statusBadge(b.status)}</TableCell>
                <TableCell className="text-right text-sm">{b.impressions.toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm">{b.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm font-medium">{ctr(b.impressions, b.clicks)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteBanner(b.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Banner</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title || ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Image URL</Label><Input value={form.image_url || ""} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Destination URL</Label><Input value={form.destination_url || ""} onChange={e => setForm(p => ({ ...p, destination_url: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Placement</Label>
                <Select value={form.placement_key} onValueChange={v => setForm(p => ({ ...p, placement_key: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLACEMENTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Device</Label>
                <Select value={form.device} onValueChange={v => setForm(p => ({ ...p, device: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input type="number" value={form.display_order ?? 0} onChange={e => setForm(p => ({ ...p, display_order: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
