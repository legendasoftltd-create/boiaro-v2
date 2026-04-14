import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Gift, Plus, Pencil, Trash2, ActivitySquare } from "lucide-react";
import SummaryCard from '@/components/admin/SummaryCard';


interface Campaign {
  id: string;
  name: string;
  is_active: boolean;
  min_order_amount: number;
  area_type: string;
  description: string | null;
  created_at: string;
}

const emptyForm = { name: "", is_active: false, min_order_amount: 500, area_type: "all", description: "" };

export default function AdminFreeShipping() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("free_shipping_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns((data as any[] || []) as Campaign[]);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowDialog(true); };
  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({ name: c.name, is_active: c.is_active, min_order_amount: c.min_order_amount, area_type: c.area_type, description: c.description || "" });
    setShowDialog(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload = {
      name: form.name.trim(),
      is_active: form.is_active,
      min_order_amount: Number(form.min_order_amount),
      area_type: form.area_type,
      description: form.description || null,
    };
    if (editing) {
      const { error } = await supabase.from("free_shipping_campaigns").update(payload as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Campaign updated");
    } else {
      const { error } = await supabase.from("free_shipping_campaigns").insert(payload as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Campaign created");
    }
    setShowDialog(false);
    load();
  };

  const toggleActive = async (c: Campaign) => {
    await supabase.from("free_shipping_campaigns").update({ is_active: !c.is_active } as any).eq("id", c.id);
    toast.success(`${c.name} → ${c.is_active ? "Inactive" : "Active"}`);
    load();
  };

  const remove = async (c: Campaign) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    await supabase.from("free_shipping_campaigns").delete().eq("id", c.id);
    toast.success("Deleted");
    load();
  };

  const areaLabel: Record<string, string> = { all: "All Areas", inside_dhaka: "ঢাকার ভিতরে", outside_dhaka: "ঢাকার বাইরে" };
  const areaColor: Record<string, string> = { all: "bg-blue-500/20 text-blue-400", inside_dhaka: "bg-emerald-500/20 text-emerald-400", outside_dhaka: "bg-amber-500/20 text-amber-400" };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-black"> Free Shipping Campaigns</h1>
         
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> New Campaign</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard
          icon={``}
          title={"Total Campaigns"}
          value={campaigns.length}
          color="#017B51"
        />
        <SummaryCard
          icon={ActivitySquare}
          title={"Active"}
          value={campaigns.filter(c => c.is_active).length}
          color="#017B51"
        />
        <SummaryCard
          icon={ActivitySquare}
          title={"Inactive"}
          value={campaigns.filter(c => !c.is_active).length}
          color="#017B51"
        />
      </div>

      <div className="">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-white">Campaign</TableHead>
              <TableHead className="text-white">Min Order (৳)</TableHead>
              <TableHead className="text-white">Area</TableHead>
              <TableHead className="text-white">Active</TableHead>
              <TableHead className="text-right text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-medium text-sm">{c.name}</p>
                  {c.description && <p className="text-xs text-black">{c.description}</p>}
                </TableCell>
                <TableCell className="font-medium">৳{c.min_order_amount}</TableCell>
                <TableCell><Badge className={areaColor[c.area_type] || ""}>{areaLabel[c.area_type] || c.area_type}</Badge></TableCell>
                <TableCell><Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!campaigns.length && (
              <TableRow><TableCell colSpan={5} className="text-center text-black py-8">No campaigns yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Campaign" : "New Campaign"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1.5">Campaign Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="৳500+ ফ্রি শিপিং" className="bg-secondary" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Min Order Amount (৳)</Label>
                <Input type="number" value={form.min_order_amount} onChange={e => setForm(f => ({ ...f, min_order_amount: Number(e.target.value) }))} className="bg-secondary" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Area</Label>
                <Select value={form.area_type} onValueChange={v => setForm(f => ({ ...f, area_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Areas</SelectItem>
                    <SelectItem value="inside_dhaka">ঢাকার ভিতরে</SelectItem>
                    <SelectItem value="outside_dhaka">ঢাকার বাইরে</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5">Description (optional)</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Campaign details..." className="bg-secondary" rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-sm">Active</Label>
            </div>
            <Button className="w-full" onClick={save}>{editing ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
