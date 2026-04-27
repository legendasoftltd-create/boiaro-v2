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
import { Truck, Package, Plus, Pencil, Trash2 } from "lucide-react";

const emptyForm = {
  name: "", description: "", zone: "", base_cost: 60, per_kg_cost: 10,
  delivery_days: "", is_active: true,
};

export default function AdminShippingMethods() {
  const utils = trpc.useUtils();
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);

  const { data: methods = [] } = trpc.admin.listShippingMethods.useQuery();

  const saveMutation = trpc.admin.upsertShippingMethod.useMutation({
    onSuccess: () => { utils.admin.listShippingMethods.invalidate(); setShowDialog(false); toast.success(editId ? "Updated" : "Created"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.deleteShippingMethod.useMutation({
    onSuccess: () => { utils.admin.listShippingMethods.invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.admin.toggleShippingMethod.useMutation({
    onSuccess: () => utils.admin.listShippingMethods.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => { setEditId(undefined); setForm({ ...emptyForm }); setShowDialog(true); };
  const openEdit = (m: any) => {
    setEditId(m.id);
    setForm({ name: m.name, description: m.description || "", zone: m.zone || "", base_cost: m.base_cost, per_kg_cost: m.per_kg_cost, delivery_days: m.delivery_days || "", is_active: m.is_active });
    setShowDialog(true);
  };

  const save = () => {
    if (!form.name) { toast.error("Name is required"); return; }
    saveMutation.mutate({ id: editId, name: form.name, description: form.description || null, zone: form.zone || null, base_cost: Number(form.base_cost), per_kg_cost: Number(form.per_kg_cost), delivery_days: form.delivery_days || null, is_active: form.is_active });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Shipping Methods</h1>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add Method</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Methods", value: (methods as any[]).length, icon: Package },
          { label: "Active", value: (methods as any[]).filter((m: any) => m.is_active).length, icon: Truck },
          { label: "Inactive", value: (methods as any[]).filter((m: any) => !m.is_active).length, icon: Package },
        ].map(c => (
          <Card key={c.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <c.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Base Cost</TableHead>
              <TableHead>Per kg</TableHead>
              <TableHead>Delivery Days</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(methods as any[]).map((m: any) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  </div>
                </TableCell>
                <TableCell>{m.zone ? <Badge variant="outline" className="text-[10px]">{m.zone}</Badge> : "—"}</TableCell>
                <TableCell className="font-medium">৳{m.base_cost}</TableCell>
                <TableCell>৳{m.per_kg_cost}/kg</TableCell>
                <TableCell className="text-sm">{m.delivery_days || "—"}</TableCell>
                <TableCell>
                  <Switch checked={m.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: m.id, isActive: v })} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Delete "${m.name}"?`)) deleteMutation.mutate({ id: m.id }); }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!(methods as any[]).length && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No shipping methods found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Edit Shipping Method" : "New Shipping Method"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1.5">Method Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-secondary" />
            </div>
            <div>
              <Label className="text-sm mb-1.5">Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Zone</Label>
                <Input value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} placeholder="inside_dhaka, outside_dhaka..." className="bg-secondary" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Delivery Days</Label>
                <Input value={form.delivery_days} onChange={e => setForm(f => ({ ...f, delivery_days: e.target.value }))} placeholder="1-3 দিন" className="bg-secondary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Base Cost (৳)</Label>
                <Input type="number" value={form.base_cost} onChange={e => setForm(f => ({ ...f, base_cost: Number(e.target.value) }))} className="bg-secondary" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Per kg Cost (৳)</Label>
                <Input type="number" value={form.per_kg_cost} onChange={e => setForm(f => ({ ...f, per_kg_cost: Number(e.target.value) }))} className="bg-secondary" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <span className="text-sm">Active</span>
            </div>
            <Button className="w-full" onClick={save} disabled={saveMutation.isPending}>{editId ? "Update Method" : "Create Method"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
