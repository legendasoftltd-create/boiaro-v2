import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Coins, Plus, Pencil, Trash2, Save, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  price: number;
  bonus_coins: number;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
}

export default function AdminCoinPackages() {
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editPkg, setEditPkg] = useState<CoinPackage | null>(null);
  const [form, setForm] = useState({ name: "", coins: "", price: "", bonus_coins: "0", sort_order: "0", is_featured: false });
  const [stats, setStats] = useState({ totalRevenue: 0, totalPurchases: 0, totalCoins: 0 });

  const load = async () => {
    const [pkgRes, purchaseRes] = await Promise.all([
      supabase.from("coin_packages").select("*").order("sort_order"),
      supabase.from("coin_purchases").select("*").eq("payment_status", "completed").order("created_at", { ascending: false }).limit(50),
    ]);
    // Admin can see all packages (active + inactive) via admin RLS policy
    setPackages((pkgRes.data as CoinPackage[]) || []);
    const completedPurchases = (purchaseRes.data as any[]) || [];
    setPurchases(completedPurchases);
    setStats({
      totalRevenue: completedPurchases.reduce((s, p) => s + Number(p.price || 0), 0),
      totalPurchases: completedPurchases.length,
      totalCoins: completedPurchases.reduce((s, p) => s + (p.coins_amount || 0), 0),
    });
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditPkg(null);
    setForm({ name: "", coins: "", price: "", bonus_coins: "0", sort_order: "0", is_featured: false });
    setOpen(true);
  };

  const openEdit = (pkg: CoinPackage) => {
    setEditPkg(pkg);
    setForm({
      name: pkg.name,
      coins: String(pkg.coins),
      price: String(pkg.price),
      bonus_coins: String(pkg.bonus_coins),
      sort_order: String(pkg.sort_order),
      is_featured: pkg.is_featured,
    });
    setOpen(true);
  };

  const save = async () => {
    const payload = {
      name: form.name,
      coins: Number(form.coins),
      price: Number(form.price),
      bonus_coins: Number(form.bonus_coins),
      sort_order: Number(form.sort_order),
      is_featured: form.is_featured,
    };

    if (editPkg) {
      await supabase.from("coin_packages").update(payload).eq("id", editPkg.id);
      toast.success("Package updated");
    } else {
      await supabase.from("coin_packages").insert(payload);
      toast.success("Package created");
    }
    setOpen(false);
    load();
  };

  const toggleActive = async (pkg: CoinPackage) => {
    await supabase.from("coin_packages").update({ is_active: !pkg.is_active }).eq("id", pkg.id);
    load();
  };

  const deletePkg = async (id: string) => {
    if (!confirm("Delete this package?")) return;
    await supabase.from("coin_packages").delete().eq("id", id);
    toast.success("Package deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coin Packages</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Package</Button>
      </div>

      {/* Revenue Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border/30">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-primary">৳{stats.totalRevenue}</p>
            <p className="text-xs text-muted-foreground">Coin Revenue</p>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4 text-center">
            <Coins className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats.totalCoins}</p>
            <p className="text-xs text-muted-foreground">Coins Sold</p>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.totalPurchases}</p>
            <p className="text-xs text-muted-foreground">Purchases</p>
          </CardContent>
        </Card>
      </div>

      {/* Packages Table */}
      <Card className="border-border/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-primary" /> Active Packages</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Coins</TableHead>
                <TableHead>Bonus</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Price (৳)</TableHead>
                <TableHead>Per Coin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">
                    {pkg.name}
                    {pkg.is_featured && <Badge className="ml-2 text-[10px] bg-primary/20 text-primary">Featured</Badge>}
                  </TableCell>
                  <TableCell>{pkg.coins}</TableCell>
                  <TableCell className="text-emerald-400">+{pkg.bonus_coins}</TableCell>
                  <TableCell className="font-bold">{pkg.coins + pkg.bonus_coins}</TableCell>
                  <TableCell>৳{pkg.price}</TableCell>
                  <TableCell className="text-muted-foreground">৳{(pkg.price / (pkg.coins + pkg.bonus_coins)).toFixed(2)}</TableCell>
                  <TableCell>
                    <button onClick={() => toggleActive(pkg)} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pkg.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                      {pkg.is_active ? "Active" : "Inactive"}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(pkg)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deletePkg(pkg.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Purchases */}
      {purchases.length > 0 && (
        <Card className="border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Coin Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Coins</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.slice(0, 20).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{p.coins_amount}</TableCell>
                    <TableCell>৳{p.price}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400">
                        {p.payment_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editPkg ? "Edit Package" : "New Coin Package"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Package Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Starter Pack" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Base Coins</Label>
                <Input type="number" value={form.coins} onChange={(e) => setForm({ ...form, coins: e.target.value })} />
              </div>
              <div>
                <Label>Bonus Coins</Label>
                <Input type="number" value={form.bonus_coins} onChange={(e) => setForm({ ...form, bonus_coins: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price (৳)</Label>
                <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
              <Label>Featured Package</Label>
            </div>
            <Button onClick={save} className="gap-2"><Save className="w-4 h-4" />Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
