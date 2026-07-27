import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ImageIcon, Plus, Search, Trash2, Eye, MousePointerClick, ArrowUp, ArrowDown, Images } from "lucide-react";
import { SiteImageUpload } from "@/components/admin/SiteImageUpload";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

interface AdBannerSlide {
  id?: string;
  image_url: string;
  destination_url: string | null;
}

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
  slides: AdBannerSlide[];
}

const PLACEMENTS = [
  "homepage_banner", "book_details", "before_reading", "before_audiobook",
  "before_hardcopy", "dashboard", "wallet_page", "reward_center",
];

export default function AdminAdBanners() {
  const utils = trpc.useUtils();
  const { dialog: confirmDialog, openConfirm } = useConfirmDialog();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Partial<AdBanner>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const { data: bannersRaw = [], isLoading: loading } = trpc.admin.listAdBanners.useQuery();
  const banners = bannersRaw as AdBanner[];
  const upsertMutation = trpc.admin.updateAdBanner.useMutation({
    onSuccess: async () => {
      await utils.admin.listAdBanners.invalidate();
      toast.success(editId ? "Banner updated" : "Banner created");
      setFormOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.admin.deleteAdBanner.useMutation({
    onSuccess: async () => {
      await utils.admin.listAdBanners.invalidate();
      toast.success("Banner deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => {
    setEditId(null);
    setForm({ status: "active", placement_key: "homepage_banner", device: "both", display_order: 0, slides: [{ image_url: "", destination_url: "" }] });
    setFormOpen(true);
  };

  const openEdit = (b: AdBanner) => {
    setEditId(b.id);
    setForm({ ...b, slides: b.slides.length > 0 ? b.slides.map(s => ({ ...s })) : [{ image_url: b.image_url || "", destination_url: b.destination_url || "" }] });
    setFormOpen(true);
  };

  const slides = form.slides || [];
  const setSlides = (next: AdBannerSlide[]) => setForm(p => ({ ...p, slides: next }));
  const addSlide = () => setSlides([...slides, { image_url: "", destination_url: "" }]);
  const removeSlide = (i: number) => setSlides(slides.filter((_, idx) => idx !== i));
  const updateSlide = (i: number, patch: Partial<AdBannerSlide>) =>
    setSlides(slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
  };

  const save = async () => {
    const validSlides = slides.filter(s => s.image_url.trim());
    if (validSlides.length === 0) {
      toast.error("Add at least one image");
      return;
    }
    upsertMutation.mutate({
      id: editId || undefined,
      title: form.title || null,
      placement_key: form.placement_key || "homepage_banner",
      status: form.status || "active",
      display_order: form.display_order || 0,
      device: form.device || "both",
      start_date: form.start_date || new Date().toISOString(),
      end_date: form.end_date || null,
      slides: validSlides.map(s => ({ id: s.id, image_url: s.image_url, destination_url: s.destination_url || null })),
    });
  };

  const deleteBanner = (id: string) => {
    openConfirm({
      message: "Are you sure you want to delete this ad banner?",
      onConfirm: () => deleteMutation.mutate({ id }),
    });
  };

  const filtered = useMemo(() => banners.filter(b =>
    !search || (b.title || "").toLowerCase().includes(search.toLowerCase()) || b.placement_key.includes(search)
  ), [banners, search]);

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
                    <div className="relative shrink-0">
                      {b.slides?.[0]?.image_url || b.image_url ? (
                        <img src={b.slides?.[0]?.image_url || b.image_url || ""} className="w-16 h-10 rounded object-cover border border-border/30" alt="" />
                      ) : (
                        <div className="w-16 h-10 rounded bg-secondary/60 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>
                      )}
                      {b.slides?.length > 1 && (
                        <Badge className="absolute -top-1.5 -right-1.5 h-4 px-1 text-[9px] gap-0.5 bg-primary text-primary-foreground">
                          <Images className="w-2.5 h-2.5" />{b.slides.length}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">{b.title || "Untitled"}</p>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[11px]">{b.placement_key}</Badge></TableCell>
                <TableCell>{statusBadge(b.status)}</TableCell>
                <TableCell className="text-right text-sm">{Number(b.impressions || 0).toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm">{Number(b.clicks || 0).toLocaleString()}</TableCell>
                <TableCell className="text-right text-sm font-medium">{ctr(Number(b.impressions || 0), Number(b.clicks || 0))}</TableCell>
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Banner</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title || ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Images {slides.length > 1 && <span className="text-muted-foreground font-normal">— slides in order, one image every 5s</span>}</Label>
                <Button type="button" size="sm" variant="outline" onClick={addSlide} className="h-7 gap-1"><Plus className="w-3 h-3" />Add image</Button>
              </div>
              <div className="space-y-3">
                {slides.map((slide, i) => (
                  <div key={slide.id ?? i} className="rounded-lg border border-border/30 p-3 space-y-2 bg-secondary/10">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">Slide {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => moveSlide(i, -1)}><ArrowUp className="w-3 h-3" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)}><ArrowDown className="w-3 h-3" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" disabled={slides.length === 1} onClick={() => removeSlide(i)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    <SiteImageUpload value={slide.image_url} onChange={url => updateSlide(i, { image_url: url })} fieldKey={`ad-banner-${i}`} />
                    <Input
                      placeholder="Destination URL (where this image links to)"
                      value={slide.destination_url || ""}
                      onChange={e => updateSlide(i, { destination_url: e.target.value })}
                      className="text-[13px]"
                    />
                  </div>
                ))}
              </div>
            </div>

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
            <Button onClick={save} disabled={upsertMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
