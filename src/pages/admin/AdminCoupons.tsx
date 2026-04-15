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
import { Ticket, Plus, Pencil, Trash2, Search } from "lucide-react";
import SummaryCard from '@/components/admin/SummaryCard';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  applies_to: string;
  min_order_amount: number;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  start_date: string;
  end_date: string | null;
  status: string;
}

const emptyForm = {
  code: "", description: "", discount_type: "percentage", discount_value: 0,
  applies_to: "all", min_order_amount: 0, usage_limit: null as number | null,
  per_user_limit: 1, start_date: new Date().toISOString().slice(0, 10),
  end_date: "", status: "active", first_order_only: false,
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("coupons" as any).select("*").order("created_at", { ascending: false });
    setCoupons((data as any[] || []) as Coupon[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = coupons.filter(c =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) || (c.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowDialog(true); };
  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code, description: c.description || "", discount_type: c.discount_type,
      discount_value: c.discount_value, applies_to: c.applies_to, min_order_amount: c.min_order_amount,
      usage_limit: c.usage_limit, per_user_limit: c.per_user_limit,
      start_date: c.start_date ? new Date(c.start_date).toISOString().slice(0, 10) : "",
      end_date: c.end_date ? new Date(c.end_date).toISOString().slice(0, 10) : "",
      status: c.status, first_order_only: (c as any).first_order_only || false,
    });
    setShowDialog(true);
  };

  const save = async () => {
    if (!form.code) { toast.error("Code required"); return; }
    const payload: any = {
      code: form.code.toUpperCase(), description: form.description || null,
      discount_type: form.discount_type, discount_value: Number(form.discount_value),
      applies_to: form.applies_to, min_order_amount: Number(form.min_order_amount),
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      per_user_limit: Number(form.per_user_limit),
      start_date: form.start_date || new Date().toISOString(),
      end_date: form.end_date || null,
      status: form.status, first_order_only: form.first_order_only,
    };
    if (editing) {
      const { error } = await supabase.from("coupons" as any).update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("coupons" as any).insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Created");
    }
    setShowDialog(false); load();
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    await supabase.from("coupons" as any).delete().eq("id", c.id);
    toast.success("Deleted"); load();
  };

  const toggleStatus = async (c: Coupon) => {
    await supabase.from("coupons" as any).update({ status: c.status === "active" ? "inactive" : "active" } as any).eq("id", c.id);
    load();
  };

  const active = coupons.filter(c => c.status === "active").length;
  const totalUsed = coupons.reduce((s, c) => s + c.used_count, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Coupons</h1>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add Coupon</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Coupons", value: coupons.length },
          { label: "Active", value: active },
          { label: "Total Uses", value: totalUsed },
          { label: "Inactive", value: coupons.length - active },
        ].map(c => (
          <SummaryCard
            icon={Ticket}
            title={c.label}
            value={c.value}
            color="#017B51"
          />
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
        <Input placeholder="Search coupons..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 " />
      </div>

      <div className="">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Applies To</TableHead>
              <TableHead>Min Amount</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-mono font-bold text-sm">{c.code}</p>
                  {c.description && <p className="text-xs text-muted-foreground truncate max-w-[150px]">{c.description}</p>}
                </TableCell>
                <TableCell className="font-semibold">
                  {c.discount_type === "percentage" ? `${c.discount_value}%` : `৳${c.discount_value}`}
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize text-xs">{c.applies_to.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-sm">{c.min_order_amount > 0 ? `৳${c.min_order_amount}` : "—"}</TableCell>
                <TableCell className="text-sm">{c.used_count}{c.usage_limit ? `/${c.usage_limit}` : ""}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(c.start_date).toLocaleDateString()}
                  {c.end_date && <> → {new Date(c.end_date).toLocaleDateString()}</>}
                </TableCell>
                <TableCell><Switch checked={c.status === "active"} onCheckedChange={() => toggleStatus(c)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No coupons</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Coupon" : "New Coupon"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm mb-1.5">Code *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className=" font-mono" /></div>
              <div>
                <Label className="text-sm mb-1.5">Applies To</Label>
                <Select value={form.applies_to} onValueChange={v => setForm(f => ({ ...f, applies_to: v }))}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">All Orders</SelectItem>
                     <SelectItem value="hardcopy">Hardcopy Only</SelectItem>
                     <SelectItem value="ebook">Ebook Only</SelectItem>
                     <SelectItem value="audiobook">Audiobook Only</SelectItem>
                     <SelectItem value="subscription">Subscription</SelectItem>
                     <SelectItem value="coin_purchase">Coin Purchase</SelectItem>
                   </SelectContent>
                 </Select>
              </div>
            </div>
            <div><Label className="text-sm mb-1.5">Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="" rows={2} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Type</Label>
                <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-sm mb-1.5">Value</Label><Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} className="" /></div>
              <div><Label className="text-sm mb-1.5">Min Amount (৳)</Label><Input type="number" value={form.min_order_amount} onChange={e => setForm(f => ({ ...f, min_order_amount: Number(e.target.value) }))} className="" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm mb-1.5">Usage Limit</Label><Input type="number" value={form.usage_limit ?? ""} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value ? Number(e.target.value) : null }))} placeholder="Unlimited" className="" /></div>
              <div><Label className="text-sm mb-1.5">Per User Limit</Label><Input type="number" value={form.per_user_limit} onChange={e => setForm(f => ({ ...f, per_user_limit: Number(e.target.value) }))} className="" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm mb-1.5">Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="" /></div>
              <div><Label className="text-sm mb-1.5">End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="" /></div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.first_order_only} onCheckedChange={v => setForm(f => ({ ...f, first_order_only: v }))} />
              <Label className="text-sm">First order only</Label>
            </div>
            <Button className="w-full" onClick={save}>{editing ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
