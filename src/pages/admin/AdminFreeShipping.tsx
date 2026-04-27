import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Gift, Plus, Pencil, Trash2 } from "lucide-react";

const emptyForm = { name: "", is_active: false, min_order_value: 500, start_date: "", end_date: "" };

export default function AdminFreeShipping() {
  const utils = trpc.useUtils();
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);

  const { data: campaigns = [] } = trpc.admin.listFreeShipping.useQuery();

  const saveMutation = trpc.admin.upsertFreeShipping.useMutation({
    onSuccess: () => { utils.admin.listFreeShipping.invalidate(); setShowDialog(false); toast.success(editId ? "Campaign updated" : "Campaign created"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.deleteFreeShipping.useMutation({
    onSuccess: () => { utils.admin.listFreeShipping.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.admin.toggleFreeShipping.useMutation({
    onSuccess: () => utils.admin.listFreeShipping.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => { setEditId(undefined); setForm({ ...emptyForm }); setShowDialog(true); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ name: c.name, is_active: c.is_active, min_order_value: c.min_order_value, start_date: c.start_date ? new Date(c.start_date).toISOString().split("T")[0] : "", end_date: c.end_date ? new Date(c.end_date).toISOString().split("T")[0] : "" });
    setShowDialog(true);
  };

  const save = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    saveMutation.mutate({ id: editId, name: form.name.trim(), is_active: form.is_active, min_order_value: Number(form.min_order_value), start_date: form.start_date || undefined, end_date: form.end_date || null });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="w-6 h-6 text-primary" /> Free Shipping Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Create campaigns to offer free shipping based on order amount</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> New Campaign</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{(campaigns as any[]).length}</p>
            <p className="text-xs text-muted-foreground">Total Campaigns</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-emerald-400">{(campaigns as any[]).filter((c: any) => c.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-muted-foreground">{(campaigns as any[]).filter((c: any) => !c.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Inactive</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Min Order (৳)</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(campaigns as any[]).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-medium text-sm">{c.name}</p>
                </TableCell>
                <TableCell className="font-medium">৳{c.min_order_value}</TableCell>
                <TableCell className="text-sm">{c.start_date ? new Date(c.start_date).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="text-sm">{c.end_date ? new Date(c.end_date).toLocaleDateString() : <Badge variant="outline" className="text-[10px]">Ongoing</Badge>}</TableCell>
                <TableCell><Switch checked={c.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, isActive: v })} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Delete "${c.name}"?`)) deleteMutation.mutate({ id: c.id }); }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!(campaigns as any[]).length && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No campaigns yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Campaign" : "New Campaign"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1.5">Campaign Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="৳500+ ফ্রি শিপিং" className="bg-secondary" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Min Order Amount (৳)</Label>
                <Input type="number" value={form.min_order_value} onChange={e => setForm(f => ({ ...f, min_order_value: Number(e.target.value) }))} className="bg-secondary" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="bg-secondary" />
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5">End Date (leave blank for ongoing)</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="bg-secondary" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-sm">Active</Label>
            </div>
            <Button className="w-full" onClick={save} disabled={saveMutation.isPending}>{editId ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
