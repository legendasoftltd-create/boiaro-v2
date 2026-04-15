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
import { toast } from "sonner";
import { Truck, Package, Search, Plus, Pencil, Copy, Trash2, MapPin } from "lucide-react";
import SummaryCard from '@/components/admin/SummaryCard';


interface ShippingMethod {
  id: string;
  name: string;
  code: string;
  area_type: string;
  base_charge: number;
  base_weight_kg: number;
  extra_charge_per_kg: number;
  delivery_time: string | null;
  is_active: boolean;
  sort_order: number;
  provider_code: string | null;
}

const areaColors: Record<string, string> = {
  inside_dhaka: "bg-emerald-500/20 text-emerald-400",
  outside_dhaka: "bg-amber-500/20 text-amber-400",
};

const emptyForm = {
  name: "", code: "", area_type: "inside_dhaka", base_charge: 60, base_weight_kg: 1,
  extra_charge_per_kg: 10, delivery_time: "", is_active: true, sort_order: 0, provider_code: "",
};

export default function AdminShippingMethods() {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [search, setSearch] = useState("");
  const [filterArea, setFilterArea] = useState("all");
  const [editing, setEditing] = useState<ShippingMethod | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("shipping_methods")
      .select("*")
      .order("sort_order", { ascending: true });
    setMethods((data as any[] || []) as ShippingMethod[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = methods.filter(m => {
    if (filterArea !== "all" && m.area_type !== filterArea) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.code.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowDialog(true); };
  const openEdit = (m: ShippingMethod) => {
    setEditing(m);
    setForm({
      name: m.name, code: m.code, area_type: m.area_type, base_charge: m.base_charge,
      base_weight_kg: m.base_weight_kg, extra_charge_per_kg: m.extra_charge_per_kg,
      delivery_time: m.delivery_time || "", is_active: m.is_active, sort_order: m.sort_order,
      provider_code: m.provider_code || "",
    });
    setShowDialog(true);
  };
  const duplicate = (m: ShippingMethod) => {
    setEditing(null);
    setForm({
      name: m.name + " (Copy)", code: m.code + "_COPY", area_type: m.area_type,
      base_charge: m.base_charge, base_weight_kg: m.base_weight_kg,
      extra_charge_per_kg: m.extra_charge_per_kg, delivery_time: m.delivery_time || "",
      is_active: false, sort_order: m.sort_order + 1, provider_code: m.provider_code || "",
    });
    setShowDialog(true);
  };

  const save = async () => {
    if (!form.name || !form.code) { toast.error("Name and code are required"); return; }
    const payload = {
      name: form.name, code: form.code, area_type: form.area_type,
      base_charge: Number(form.base_charge), base_weight_kg: Number(form.base_weight_kg),
      extra_charge_per_kg: Number(form.extra_charge_per_kg),
      delivery_time: form.delivery_time || null, is_active: form.is_active,
      sort_order: Number(form.sort_order), provider_code: form.provider_code || null,
    };
    if (editing) {
      const { error } = await supabase.from("shipping_methods").update(payload as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("shipping_methods").insert(payload as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Created");
    }
    setShowDialog(false);
    load();
  };

  const toggleActive = async (m: ShippingMethod) => {
    await supabase.from("shipping_methods").update({ is_active: !m.is_active } as any).eq("id", m.id);
    toast.success(`${m.name} → ${m.is_active ? "Inactive" : "Active"}`);
    load();
  };

  const remove = async (m: ShippingMethod) => {
    if (!confirm(`Delete "${m.name}"?`)) return;
    await supabase.from("shipping_methods").delete().eq("id", m.id);
    toast.success("Deleted");
    load();
  };

  // Example calculation preview
  const previewCharge = (method: typeof emptyForm, weight: number) => {
    if (weight <= method.base_weight_kg) return method.base_charge;
    return method.base_charge + Math.ceil(weight - method.base_weight_kg) * method.extra_charge_per_kg;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Shipping Methods</h1>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add Method</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Methods", value: methods.length, icon: Package },
          { label: "ঢাকার ভিতরে", value: methods.filter(m => m.area_type === "inside_dhaka").length, icon: MapPin },
          { label: "ঢাকার বাইরে", value: methods.filter(m => m.area_type === "outside_dhaka").length, icon: Truck },
        ].map(c => (
          // <Card key={c.label} className="bg-card border-border">
          //   <CardContent className="p-4 flex items-center gap-3">
          //     <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          //       <c.icon className="w-5 h-5 text-primary" />
          //     </div>
          //     <div>
          //       <p className="text-2xl font-bold">{c.value}</p>
          //       <p className="text-xs text-muted-foreground">{c.label}</p>
          //     </div>
          //   </CardContent>
          // </Card>
          <SummaryCard
            icon={c.icon}
            title={c.label}
            value={c.value}
            color="#017B51"
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Areas</SelectItem>
            <SelectItem value="inside_dhaka">ঢাকার ভিতরে</SelectItem>
            <SelectItem value="outside_dhaka">ঢাকার বাইরে</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-white">Method</TableHead>
              <TableHead className="text-white">Area</TableHead>
              <TableHead className="text-white">Base Charge</TableHead>
              <TableHead className="text-white">Base Weight</TableHead>
              <TableHead className="text-white">Extra/kg</TableHead>
              <TableHead className="text-white">Delivery</TableHead>
              <TableHead className="text-white">Provider</TableHead>
              <TableHead className="text-white">Active</TableHead>
              <TableHead className="text-right text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(m => (
              <TableRow key={m.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{m.code}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={areaColors[m.area_type] || ""}>
                    {m.area_type === "inside_dhaka" ? "ঢাকার ভিতরে" : "ঢাকার বাইরে"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">৳{m.base_charge}</TableCell>
                <TableCell>{m.base_weight_kg} kg</TableCell>
                <TableCell>৳{m.extra_charge_per_kg}/kg</TableCell>
                <TableCell className="text-sm">{m.delivery_time || "—"}</TableCell>
                <TableCell className="text-sm">{m.provider_code || "—"}</TableCell>
                <TableCell>
                  <Switch checked={m.is_active} onCheckedChange={() => toggleActive(m)} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => duplicate(m)}><Copy className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(m)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No shipping methods found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Shipping Method" : "New Shipping Method"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Method Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Code *</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className=" font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Area Type</Label>
                <Select value={form.area_type} onValueChange={v => setForm(f => ({ ...f, area_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inside_dhaka">ঢাকার ভিতরে</SelectItem>
                    <SelectItem value="outside_dhaka">ঢাকার বাইরে</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-1.5">Provider Code</Label>
                <Input value={form.provider_code} onChange={e => setForm(f => ({ ...f, provider_code: e.target.value }))} placeholder="redx, pathao..." className="" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Base Charge (৳)</Label>
                <Input type="number" value={form.base_charge} onChange={e => setForm(f => ({ ...f, base_charge: Number(e.target.value) }))} className="" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Base Weight (kg)</Label>
                <Input type="number" step="0.5" value={form.base_weight_kg} onChange={e => setForm(f => ({ ...f, base_weight_kg: Number(e.target.value) }))} className="" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Extra / kg (৳)</Label>
                <Input type="number" value={form.extra_charge_per_kg} onChange={e => setForm(f => ({ ...f, extra_charge_per_kg: Number(e.target.value) }))} className="" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Delivery Time</Label>
                <Input value={form.delivery_time} onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))} placeholder="1-3 দিন" className="" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="" />
              </div>
            </div>

            {/* Charge preview */}
            <div className="p-3 rounded-lg bg-[#017B51] border text-sm space-y-1">
              <p className="font-medium text-white">চার্জ প্রিভিউ</p>
              {[0.5, 1, 1.5, 2, 3, 5].map(w => (
                <div key={w} className="flex justify-between text-xs text-white">
                  <span>{w} kg</span>
                  <span className="font-medium">৳{previewCharge(form, w)}</span>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={save}>{editing ? "Update Method" : "Create Method"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
