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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Crown, Plus, Pencil, Trash2, Star, Search } from "lucide-react";
import SummaryCard from '@/components/admin/SummaryCard';

interface Plan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price: number;
  billing_type: string;
  access_type: string;
  status: string;
  sort_order: number;
  is_featured: boolean;
  trial_days: number;
  benefits: string[];
}

const billingLabels: Record<string, string> = { monthly: "Monthly", yearly: "Yearly", lifetime: "Lifetime" };
const accessLabels: Record<string, string> = { ebook: "eBook Only", audiobook: "Audiobook Only", both: "eBook + Audiobook", premium: "Premium All Access" };

const defaultBenefits = [
  "Unlimited eBook reading",
  "Unlimited audiobook listening",
  "Premium-only content access",
  "Ad-free experience",
  "Discount on hardcopy orders",
  "Early access to new releases",
];

const emptyForm = {
  name: "", code: "", description: "", price: 0, billing_type: "monthly",
  access_type: "both", status: "active", sort_order: 0, is_featured: false,
  trial_days: 0, benefits: [] as string[],
};

export default function AdminSubscriptionPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("subscription_plans" as any).select("*").order("sort_order");
    setPlans((data as any[] || []) as Plan[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = plans.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowDialog(true); };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name, code: p.code, description: p.description || "", price: p.price,
      billing_type: p.billing_type, access_type: p.access_type, status: p.status,
      sort_order: p.sort_order, is_featured: p.is_featured, trial_days: p.trial_days,
      benefits: Array.isArray(p.benefits) ? p.benefits : [],
    });
    setShowDialog(true);
  };

  const toggleBenefit = (b: string) => {
    setForm(f => ({
      ...f,
      benefits: f.benefits.includes(b) ? f.benefits.filter(x => x !== b) : [...f.benefits, b],
    }));
  };

  const save = async () => {
    if (!form.name || !form.code) { toast.error("Name and code required"); return; }
    const payload = {
      name: form.name, code: form.code, description: form.description || null,
      price: Number(form.price), billing_type: form.billing_type, access_type: form.access_type,
      status: form.status, sort_order: Number(form.sort_order), is_featured: form.is_featured,
      trial_days: Number(form.trial_days), benefits: form.benefits,
    };
    if (editing) {
      const { error } = await supabase.from("subscription_plans" as any).update(payload as any).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("subscription_plans" as any).insert(payload as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Created");
    }
    setShowDialog(false); load();
  };

  const remove = async (p: Plan) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    await supabase.from("subscription_plans" as any).delete().eq("id", p.id);
    toast.success("Deleted"); load();
  };

  const toggleStatus = async (p: Plan) => {
    await supabase.from("subscription_plans" as any).update({ status: p.status === "active" ? "inactive" : "active" } as any).eq("id", p.id);
    load();
  };

  const active = plans.filter(p => p.status === "active").length;
  const featured = plans.filter(p => p.is_featured).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Subscription Plans</h1>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add Plan</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Plans", value: plans.length },
          { label: "Active", value: active },
          { label: "Featured", value: featured },
          { label: "Inactive", value: plans.length - active },
        ].map(c => (
          // <Card key={c.label} className="bg-card border-border">
          //   <CardContent className="p-4 flex items-center gap-3">
          //     <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          //       <Crown className="w-5 h-5 text-primary" />
          //     </div>
          //     <div>
          //       <p className="text-2xl font-bold">{c.value}</p>
          //       <p className="text-xs text-muted-foreground">{c.label}</p>
          //     </div>
          //   </CardContent>
          // </Card>
          <SummaryCard
          icon={Crown}
          title={c.label}
          value={c.value}
          color="#017B51"
        />
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
        <Input placeholder="Search plans..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 " />
      </div>

      <div className="">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Trial</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-black font-mono">{p.code}</p>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize text-black">{billingLabels[p.billing_type] || p.billing_type}</Badge></TableCell>
                <TableCell className="text-sm">{accessLabels[p.access_type] || p.access_type}</TableCell>
                <TableCell className="font-semibold">৳{p.price}</TableCell>
                <TableCell className="text-sm">{p.trial_days > 0 ? `${p.trial_days} days` : "—"}</TableCell>
                <TableCell>{p.is_featured && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}</TableCell>
                <TableCell><Switch checked={p.status === "active"} onCheckedChange={() => toggleStatus(p)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No plans</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Plan" : "New Plan"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm mb-1.5">Plan Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="" /></div>
              <div><Label className="text-sm mb-1.5">Code *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className=" font-mono" /></div>
            </div>
            <div><Label className="text-sm mb-1.5">Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="" rows={2} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label className="text-sm mb-1.5">Price (৳)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} className="" /></div>
              <div>
                <Label className="text-sm mb-1.5">Billing</Label>
                <Select value={form.billing_type} onValueChange={v => setForm(f => ({ ...f, billing_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="lifetime">Lifetime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-1.5">Access</Label>
                <Select value={form.access_type} onValueChange={v => setForm(f => ({ ...f, access_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ebook">eBook Only</SelectItem>
                    <SelectItem value="audiobook">Audiobook Only</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="premium">Premium All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label className="text-sm mb-1.5">Trial Days</Label><Input type="number" value={form.trial_days} onChange={e => setForm(f => ({ ...f, trial_days: Number(e.target.value) }))} className="" /></div>
              <div><Label className="text-sm mb-1.5">Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="" /></div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.is_featured} onCheckedChange={v => setForm(f => ({ ...f, is_featured: v }))} />
                <Label className="text-sm">Featured</Label>
              </div>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Benefits</Label>
              <div className="space-y-2">
                {defaultBenefits.map(b => (
                  <div key={b} className="flex items-center gap-2">
                    <Checkbox checked={form.benefits.includes(b)} onCheckedChange={() => toggleBenefit(b)} />
                    <span className="text-sm">{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={save}>{editing ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
