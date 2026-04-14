import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
  ad_type: string;
  placement_key: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  target_page: string | null;
  notes: string | null;
}

export default function AdminAdCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Partial<Campaign>>({});
  const [editId, setEditId] = useState<string | null>(null);

  const fetchData = async () => {
    const { data } = await supabase.from("ad_campaigns" as any).select("*").order("created_at", { ascending: false });
    setCampaigns((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditId(null); setForm({ status: "active", ad_type: "banner" }); setFormOpen(true); };
  const openEdit = (c: Campaign) => { setEditId(c.id); setForm({ ...c }); setFormOpen(true); };

  const save = async () => {
    const payload = {
      name: form.name || "Untitled",
      ad_type: form.ad_type || "banner",
      placement_key: form.placement_key || null,
      status: form.status || "active",
      target_page: form.target_page || null,
      notes: form.notes || null,
      start_date: form.start_date || new Date().toISOString(),
      end_date: form.end_date || null,
      updated_at: new Date().toISOString(),
    };
    if (editId) {
      await supabase.from("ad_campaigns" as any).update(payload).eq("id", editId);
      toast.success("Campaign updated");
    } else {
      await supabase.from("ad_campaigns" as any).insert(payload);
      toast.success("Campaign created");
    }
    setFormOpen(false);
    fetchData();
  };

  const del = async (id: string) => {
    await supabase.from("ad_campaigns" as any).delete().eq("id", id);
    toast.success("Campaign deleted");
    fetchData();
  };

  const filtered = campaigns.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  const statusBadge = (s: string) => {
    const c: Record<string, string> = { active: "bg-emerald-500/20 text-emerald-400", inactive: "bg-secondary text-muted-foreground", scheduled: "bg-blue-500/20 text-blue-400", expired: "bg-red-500/20 text-red-400" };
    return <Badge className={c[s] || "bg-secondary"}>{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2 text-black"> Ad Campaigns</h1>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" />New Campaign</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
        <Input placeholder="Search campaigns..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      <Card className="border-border/30">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Placement</TableHead><TableHead>Status</TableHead><TableHead>Start</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No campaigns</TableCell></TableRow>
            : filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-sm">{c.name}</TableCell>
                <TableCell><Badge variant="secondary">{c.ad_type}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.placement_key || "—"}</TableCell>
                <TableCell>{statusBadge(c.status)}</TableCell>
                <TableCell className="text-sm">{new Date(c.start_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Campaign Name</Label><Input value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ad Type</Label>
                <Select value={form.ad_type || "banner"} onValueChange={v => setForm(p => ({ ...p, ad_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banner">Banner</SelectItem>
                    <SelectItem value="rewarded">Rewarded</SelectItem>
                    <SelectItem value="promotional">Promotional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || "active"} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Target Page</Label><Input value={form.target_page || ""} onChange={e => setForm(p => ({ ...p, target_page: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
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
