import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Settings, BookOpen, Headphones, Package, Save, Loader2, TrendingUp, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

export default function AdminRevenueSplits() {
  const utils = trpc.useUtils();
  const [defaults, setDefaults] = useState<any[]>([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState<any>({
    book_id: "", format: "ebook", writer_percentage: 35, publisher_percentage: 30,
    narrator_percentage: 0, platform_percentage: 35, fulfillment_cost_percentage: 0,
  });

  const { data: defaultRules = [] } = trpc.admin.listDefaultRevenueRules.useQuery();
  useEffect(() => {
    if (defaultRules.length > 0) setDefaults(defaultRules as any[]);
  }, [defaultRules]);
  const { data: bookSplits = [] } = trpc.admin.listRevenueOverrides.useQuery();
  const { data: earnings = [] } = trpc.admin.listEarnings.useQuery({ limit: 50 });
  const { data: stats } = trpc.admin.revenueStats.useQuery();
  const { data: books = [] } = trpc.admin.listBookTitles.useQuery();

  const updateDefaultMutation = trpc.admin.updateDefaultRevenueRule.useMutation({
    onSuccess: () => { utils.admin.listDefaultRevenueRules.invalidate(); toast.success("Updated"); },
    onError: (e) => toast.error(e.message),
  });

  const upsertOverrideMutation = trpc.admin.upsertRevenueOverride.useMutation({
    onSuccess: () => { utils.admin.listRevenueOverrides.invalidate(); setOverrideOpen(false); toast.success("Revenue split saved"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteOverrideMutation = trpc.admin.deleteRevenueOverride.useMutation({
    onSuccess: () => { utils.admin.listRevenueOverrides.invalidate(); toast.success("Override removed, default rules will apply"); },
    onError: (e) => toast.error(e.message),
  });

  const localDefaults = defaults.length ? defaults : (defaultRules as any[]);

  const getTotal = (rule: any) =>
    Number(rule.writer_percentage || 0) + Number(rule.publisher_percentage || 0) + Number(rule.narrator_percentage || 0) +
    Number(rule.platform_percentage || 0) + Number(rule.fulfillment_cost_percentage || 0);

  const validateRule = (rule: any): string | null => {
    const total = getTotal(rule);
    if (Math.abs(total - 100) > 0.01) return `Total must be 100% (currently ${total}%)`;
    return null;
  };

  const saveDefault = (rule: any) => {
    const err = validateRule(rule);
    if (err) { toast.error(err); return; }
    updateDefaultMutation.mutate({ id: rule.id, writer_percentage: Number(rule.writer_percentage), publisher_percentage: Number(rule.publisher_percentage), narrator_percentage: Number(rule.narrator_percentage), platform_percentage: Number(rule.platform_percentage), fulfillment_cost_percentage: Number(rule.fulfillment_cost_percentage) });
  };

  const saveOverride = () => {
    const err = validateRule(overrideForm);
    if (err) { toast.error(err); return; }
    if (!overrideForm.book_id) { toast.error("Select a book"); return; }
    upsertOverrideMutation.mutate({ book_id: overrideForm.book_id, format: overrideForm.format, writer_percentage: Number(overrideForm.writer_percentage), publisher_percentage: Number(overrideForm.publisher_percentage), narrator_percentage: Number(overrideForm.narrator_percentage), platform_percentage: Number(overrideForm.platform_percentage), fulfillment_cost_percentage: Number(overrideForm.fulfillment_cost_percentage) });
  };

  const updateLocalDefault = (idx: number, field: string, value: number) => {
    setDefaults(prev => {
      if (!prev.length) return (defaultRules as any[]).map((r: any, i) => i === idx ? { ...r, [field]: value } : r);
      return prev.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    });
  };

  const loadDefaultForFormat = (format: string) => {
    const rule = localDefaults.find((d: any) => d.format === format);
    if (rule) {
      setOverrideForm((prev: any) => ({ ...prev, format, writer_percentage: rule.writer_percentage, publisher_percentage: rule.publisher_percentage, narrator_percentage: rule.narrator_percentage, platform_percentage: rule.platform_percentage, fulfillment_cost_percentage: rule.fulfillment_cost_percentage }));
    } else {
      setOverrideForm((prev: any) => ({ ...prev, format }));
    }
  };

  const formatIcon = (f: string) => f === "ebook" ? <BookOpen className="h-4 w-4" /> : f === "audiobook" ? <Headphones className="h-4 w-4" /> : <Package className="h-4 w-4" />;
  const formatLabel = (f: string) => f === "ebook" ? "eBook" : f === "audiobook" ? "Audiobook" : "Hard Copy";

  const fieldsForFormat = (format: string) => {
    const base = [{ key: "writer_percentage", label: "Writer" }, { key: "publisher_percentage", label: "Publisher" }];
    if (format === "audiobook") base.push({ key: "narrator_percentage", label: "Narrator" });
    base.push({ key: "platform_percentage", label: "BoiAro Platform" });
    if (format === "hardcopy") base.push({ key: "fulfillment_cost_percentage", label: "Fulfillment Cost" });
    return base;
  };

  const statsData = stats || { totalSales: 0, platformEarnings: 0, writerPayouts: 0, publisherPayouts: 0, narratorPayouts: 0, pendingWithdrawals: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-400" /> Revenue Management
        </h1>
        <Button onClick={() => {
          const rule = localDefaults.find((d: any) => d.format === "ebook");
          setOverrideForm({ book_id: "", format: "ebook", writer_percentage: rule?.writer_percentage || 35, publisher_percentage: rule?.publisher_percentage || 30, narrator_percentage: 0, platform_percentage: rule?.platform_percentage || 35, fulfillment_cost_percentage: 0 });
          setOverrideOpen(true);
        }}>
          <Settings className="h-4 w-4 mr-2" /> Per-Book Override
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Sales", value: `৳${Number(statsData.totalSales).toFixed(0)}`, icon: TrendingUp, color: "text-primary" },
          { label: "Platform Earnings", value: `৳${Number(statsData.platformEarnings).toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
          { label: "Writer Payouts", value: `৳${Number(statsData.writerPayouts).toFixed(0)}`, icon: Users, color: "text-blue-400" },
          { label: "Publisher Payouts", value: `৳${Number(statsData.publisherPayouts).toFixed(0)}`, icon: Package, color: "text-purple-400" },
          { label: "Narrator Payouts", value: `৳${Number(statsData.narratorPayouts).toFixed(0)}`, icon: Headphones, color: "text-orange-400" },
          { label: "Pending Withdrawals", value: `৳${Number(statsData.pendingWithdrawals).toFixed(0)}`, icon: Wallet, color: "text-yellow-400" },
        ].map(s => (
          <Card key={s.label} className="bg-card/60 border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color} shrink-0`} />
              <div className="min-w-0">
                <p className="text-lg font-bold truncate">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Default Revenue Rules by Format</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {localDefaults.map((rule: any, idx: number) => (
              <Card key={rule.format} className="bg-secondary/50 border-border/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {formatIcon(rule.format)}<span>{formatLabel(rule.format)}</span>
                  </div>
                  {fieldsForFormat(rule.format).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Label className="text-xs w-28">{label}</Label>
                      <Input type="number" min={0} max={100} step={1} className="h-8 w-20 text-sm"
                        value={(rule as any)[key]}
                        onChange={(e) => updateLocalDefault(idx, key, Number(e.target.value))} />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  ))}
                  <div className={`text-xs font-medium ${Math.abs(getTotal(rule) - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                    Total: {getTotal(rule)}%
                    {rule.format === "hardcopy" && <span className="ml-1">(incl. fulfillment)</span>}
                  </div>
                  <Button size="sm" className="w-full" onClick={() => saveDefault(rule)} disabled={updateDefaultMutation.isPending || Math.abs(getTotal(rule) - 100) > 0.01}>
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Per-Book Revenue Overrides</CardTitle></CardHeader>
        <CardContent>
          {(bookSplits as any[]).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead><TableHead>Format</TableHead><TableHead>Writer</TableHead><TableHead>Publisher</TableHead>
                  <TableHead>Narrator</TableHead><TableHead>Platform</TableHead><TableHead>Fulfillment</TableHead><TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(bookSplits as any[]).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium max-w-[120px] truncate">{s.books?.title || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{s.format}</Badge></TableCell>
                    <TableCell>{s.writer_percentage}%</TableCell>
                    <TableCell>{s.publisher_percentage}%</TableCell>
                    <TableCell>{s.narrator_percentage > 0 ? `${s.narrator_percentage}%` : "—"}</TableCell>
                    <TableCell>{s.platform_percentage}%</TableCell>
                    <TableCell>{s.fulfillment_cost_percentage > 0 ? `${s.fulfillment_cost_percentage}%` : "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => deleteOverrideMutation.mutate({ id: s.id })}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No per-book overrides. Default rules apply to all books.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Transactions</CardTitle></CardHeader>
        <CardContent>
          {(earnings as any[]).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead><TableHead>Format</TableHead><TableHead>Role</TableHead>
                  <TableHead>Sale</TableHead><TableHead>%</TableHead><TableHead>Earned</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(earnings as any[]).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-[100px] truncate">{e.books?.title || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{e.format}</Badge></TableCell>
                    <TableCell className="capitalize text-xs">{e.role}</TableCell>
                    <TableCell>৳{e.sale_amount}</TableCell>
                    <TableCell>{e.percentage}%</TableCell>
                    <TableCell className="font-semibold text-emerald-400">৳{e.earned_amount}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{e.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No earnings recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Set Revenue Split for Book</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Book</Label>
              <Select value={overrideForm.book_id} onValueChange={(v) => setOverrideForm({ ...overrideForm, book_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
                <SelectContent>{(books as any[]).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Format</Label>
              <Select value={overrideForm.format} onValueChange={(v) => loadDefaultForFormat(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ebook">eBook</SelectItem>
                  <SelectItem value="audiobook">Audiobook</SelectItem>
                  <SelectItem value="hardcopy">Hard Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fieldsForFormat(overrideForm.format).map(({ key, label }) => (
              <div key={key}>
                <Label>{label} %</Label>
                <Input type="number" min={0} max={100} value={(overrideForm as any)[key]}
                  onChange={(e) => setOverrideForm({ ...overrideForm, [key]: Number(e.target.value) })} />
              </div>
            ))}
            <div className={`text-sm font-medium ${Math.abs(getTotal(overrideForm) - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
              Total: {getTotal(overrideForm)}%
              {Math.abs(getTotal(overrideForm) - 100) > 0.01 && " — must equal 100%"}
            </div>
            <Button className="w-full" onClick={saveOverride} disabled={upsertOverrideMutation.isPending || Math.abs(getTotal(overrideForm) - 100) > 0.01}>
              {upsertOverrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Override
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
