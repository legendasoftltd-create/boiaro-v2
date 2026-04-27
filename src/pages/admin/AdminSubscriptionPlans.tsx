import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Crown, Plus, Pencil, Trash2, Star, Search } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_days: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  is_featured: boolean;
}

const defaultBenefits = [
  "Unlimited eBook reading",
  "Unlimited audiobook listening",
  "Premium-only content access",
  "Ad-free experience",
  "Discount on hardcopy orders",
  "Early access to new releases",
];

const emptyForm = {
  name: "", description: "", price: 0, duration_days: 30,
  sort_order: 0, is_featured: false, is_active: true, features: [] as string[],
};

export default function AdminSubscriptionPlans() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);

  const { data: plansRaw = [] } = trpc.admin.listSubscriptionPlans.useQuery();
  const plans = plansRaw as Plan[];
  const createMutation = trpc.admin.createPlan.useMutation({
    onSuccess: async () => {
      toast.success("Created");
      setShowDialog(false);
      await utils.admin.listSubscriptionPlans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.admin.updatePlan.useMutation({
    onSuccess: async () => {
      toast.success("Updated");
      setShowDialog(false);
      await utils.admin.listSubscriptionPlans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.admin.deletePlan.useMutation({
    onSuccess: async () => {
      toast.success("Deleted");
      await utils.admin.listSubscriptionPlans.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => plans.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  ), [plans, search]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowDialog(true); };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description || "",
      price: p.price,
      duration_days: p.duration_days,
      sort_order: p.sort_order,
      is_featured: p.is_featured,
      is_active: p.is_active,
      features: Array.isArray(p.features) ? p.features : [],
    });
    setShowDialog(true);
  };

  const toggleBenefit = (b: string) => {
    setForm(f => ({
      ...f,
      features: f.features.includes(b) ? f.features.filter(x => x !== b) : [...f.features, b],
    }));
  };

  const save = async () => {
    if (!form.name) { toast.error("Name required"); return; }
    const payload = {
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      duration_days: Number(form.duration_days),
      sort_order: Number(form.sort_order),
      is_featured: form.is_featured,
      is_active: form.is_active,
      features: form.features,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const remove = async (p: Plan) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    deleteMutation.mutate({ id: p.id });
  };

  const toggleStatus = async (p: Plan) => {
    updateMutation.mutate({
      id: p.id,
      name: p.name,
      description: p.description || null,
      price: p.price,
      duration_days: p.duration_days,
      sort_order: p.sort_order,
      is_featured: p.is_featured,
      is_active: !p.is_active,
      features: p.features || [],
    });
  };

  const active = plans.filter(p => p.is_active).length;
  const featured = plans.filter(p => p.is_featured).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Subscription Plans</h1>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add Plan</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Plans", value: plans.length },
          { label: "Active", value: active },
          { label: "Featured", value: featured },
          { label: "Inactive", value: plans.length - active },
        ].map(c => (
          <Card key={c.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search plans..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-secondary" />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Features</TableHead>
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
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{p.duration_days} days</TableCell>
                <TableCell className="font-semibold">৳{p.price}</TableCell>
                <TableCell className="text-sm">{p.features?.length || 0}</TableCell>
                <TableCell>{p.is_featured && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}</TableCell>
                <TableCell><Switch checked={p.is_active} onCheckedChange={() => toggleStatus(p)} /></TableCell>
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
              <div><Label className="text-sm mb-1.5">Plan Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-secondary" /></div>
              <div><Label className="text-sm mb-1.5">Duration (days)</Label><Input type="number" value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: Number(e.target.value) }))} className="bg-secondary" /></div>
            </div>
            <div><Label className="text-sm mb-1.5">Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary" rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm mb-1.5">Price (৳)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} className="bg-secondary" /></div>
              <div><Label className="text-sm mb-1.5">Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="bg-secondary" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.is_featured} onCheckedChange={v => setForm(f => ({ ...f, is_featured: v }))} />
                <Label className="text-sm">Featured</Label>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label className="text-sm">Active</Label>
              </div>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Benefits</Label>
              <div className="space-y-2">
                {defaultBenefits.map(b => (
                  <div key={b} className="flex items-center gap-2">
                    <Checkbox checked={form.features.includes(b)} onCheckedChange={() => toggleBenefit(b)} />
                    <span className="text-sm">{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
