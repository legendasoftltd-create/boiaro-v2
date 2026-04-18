import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Settings, BookOpen, Headphones, Package, Save, Loader2,
  TrendingUp, Users, Wallet,
} from "lucide-react";
import { toast } from "sonner";

interface RevenueRule {
  id?: string;
  format: string;
  writer_percentage: number;
  publisher_percentage: number;
  narrator_percentage: number;
  platform_percentage: number;
  fulfillment_cost_percentage: number;
}

export default function AdminRevenueSplits() {
  const [defaults, setDefaults] = useState<RevenueRule[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [bookSplits, setBookSplits] = useState<any[]>([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState<any>({
    book_id: "", format: "ebook", writer_percentage: 35, publisher_percentage: 30,
    narrator_percentage: 0, platform_percentage: 35, fulfillment_cost_percentage: 0,
  });
  const [saving, setSaving] = useState(false);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalSales: 0, platformEarnings: 0, writerPayouts: 0,
    publisherPayouts: 0, narratorPayouts: 0, pendingWithdrawals: 0,
  });
  const [topBooks, setTopBooks] = useState<any[]>([]);
  const [topContributors, setTopContributors] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [d, b, s, e, w] = await Promise.all([
      supabase.from("default_revenue_rules").select("*").order("format"),
      supabase.from("books").select("id, title").order("title"),
      supabase.from("format_revenue_splits").select("*, books(title)").order("created_at", { ascending: false }),
      supabase.from("contributor_earnings").select("*, books(title)").order("created_at", { ascending: false }).limit(50),
      supabase.from("withdrawal_requests").select("*"),
    ]);
    setDefaults((d.data || []) as any);
    setBooks(b.data || []);
    setBookSplits(s.data || []);
    setEarnings(e.data || []);

    // Calculate stats
    const allEarnings = e.data || [];
    const allWithdrawals = w.data || [];
    // Deduplicate total sales by order_id to avoid counting once per contributor role
    const uniqueOrderSales = new Map<string, number>();
    allEarnings.forEach((e: any) => {
      if (e.order_id && !uniqueOrderSales.has(e.order_id)) {
        uniqueOrderSales.set(e.order_id, Number(e.sale_amount || 0));
      }
    });
    setStats({
      totalSales: Array.from(uniqueOrderSales.values()).reduce((s, v) => s + v, 0),
      platformEarnings: allEarnings.filter(e => e.role === "platform").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      writerPayouts: allEarnings.filter(e => e.role === "writer").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      publisherPayouts: allEarnings.filter(e => e.role === "publisher").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      narratorPayouts: allEarnings.filter(e => e.role === "narrator").reduce((s, e) => s + Number(e.earned_amount || 0), 0),
      pendingWithdrawals: allWithdrawals.filter(w => w.status === "pending").reduce((s, w) => s + Number(w.amount || 0), 0),
    });

    // Top books by earnings
    const bookEarnings: Record<string, { title: string; total: number }> = {};
    allEarnings.forEach((e: any) => {
      const key = e.book_id;
      if (!bookEarnings[key]) bookEarnings[key] = { title: e.books?.title || "Unknown", total: 0 };
      bookEarnings[key].total += Number(e.earned_amount || 0);
    });
    setTopBooks(Object.values(bookEarnings).sort((a, b) => b.total - a.total).slice(0, 5));

    // Top contributors
    const contribEarnings: Record<string, { userId: string; role: string; total: number }> = {};
    allEarnings.filter((e: any) => e.role !== "platform").forEach((e: any) => {
      const key = `${e.user_id}-${e.role}`;
      if (!contribEarnings[key]) contribEarnings[key] = { userId: e.user_id, role: e.role, total: 0 };
      contribEarnings[key].total += Number(e.earned_amount || 0);
    });
    setTopContributors(Object.values(contribEarnings).sort((a, b) => b.total - a.total).slice(0, 5));
  };

  const getTotal = (rule: RevenueRule) =>
    rule.writer_percentage + rule.publisher_percentage + rule.narrator_percentage +
    rule.platform_percentage + rule.fulfillment_cost_percentage;

  const validateRule = (rule: RevenueRule): string | null => {
    const total = getTotal(rule);
    if (Math.abs(total - 100) > 0.01) return `Total must be 100% (currently ${total}%)`;
    if (rule.format !== "audiobook" && rule.narrator_percentage > 0) return "Narrator % should be 0 for non-audiobook formats";
    if (rule.format !== "hardcopy" && rule.fulfillment_cost_percentage > 0) return "Fulfillment cost only applies to hardcopy";
    return null;
  };

  const saveDefault = async (rule: RevenueRule) => {
    const err = validateRule(rule);
    if (err) { toast.error(err); return; }
    setSaving(true);
    const { error } = await supabase.from("default_revenue_rules").update({
      writer_percentage: rule.writer_percentage,
      publisher_percentage: rule.publisher_percentage,
      narrator_percentage: rule.narrator_percentage,
      platform_percentage: rule.platform_percentage,
      fulfillment_cost_percentage: rule.fulfillment_cost_percentage,
    }).eq("id", rule.id!);
    if (error) toast.error(error.message);
    else toast.success(`Default ${rule.format} rule updated`);
    setSaving(false);
  };

  const saveOverride = async () => {
    const err = validateRule(overrideForm);
    if (err) { toast.error(err); return; }
    if (!overrideForm.book_id) { toast.error("Select a book"); return; }
    setSaving(true);
    const { error } = await supabase.from("format_revenue_splits").upsert({
      book_id: overrideForm.book_id,
      format: overrideForm.format,
      writer_percentage: overrideForm.writer_percentage,
      publisher_percentage: overrideForm.publisher_percentage,
      narrator_percentage: overrideForm.narrator_percentage,
      platform_percentage: overrideForm.platform_percentage,
      fulfillment_cost_percentage: overrideForm.fulfillment_cost_percentage,
    }, { onConflict: "book_id,format" });
    if (error) toast.error(error.message);
    else { toast.success("Revenue split saved"); setOverrideOpen(false); load(); }
    setSaving(false);
  };

  const deleteOverride = async (id: string) => {
    await supabase.from("format_revenue_splits").delete().eq("id", id);
    toast.success("Override removed, default rules will apply");
    load();
  };

  const loadDefaultForFormat = (format: string) => {
    const rule = defaults.find(d => d.format === format);
    if (rule) {
      setOverrideForm((prev: any) => ({
        ...prev, format,
        writer_percentage: rule.writer_percentage,
        publisher_percentage: rule.publisher_percentage,
        narrator_percentage: rule.narrator_percentage,
        platform_percentage: rule.platform_percentage,
        fulfillment_cost_percentage: rule.fulfillment_cost_percentage,
      }));
    }
  };

  const formatIcon = (f: string) => {
    if (f === "ebook") return <BookOpen className="h-4 w-4" />;
    if (f === "audiobook") return <Headphones className="h-4 w-4" />;
    return <Package className="h-4 w-4" />;
  };

  const formatLabel = (f: string) => {
    if (f === "ebook") return "eBook";
    if (f === "audiobook") return "Audiobook";
    return "Hard Copy";
  };

  const updateDefault = (idx: number, field: string, value: number) => {
    const updated = [...defaults];
    (updated[idx] as any)[field] = value;
    setDefaults(updated);
  };

  const fieldsForFormat = (format: string) => {
    const base = [
      { key: "writer_percentage", label: "Writer" },
      { key: "publisher_percentage", label: "Publisher" },
    ];
    if (format === "audiobook") base.push({ key: "narrator_percentage", label: "Narrator" });
    base.push({ key: "platform_percentage", label: "BoiAro Platform" });
    if (format === "hardcopy") base.push({ key: "fulfillment_cost_percentage", label: "Fulfillment Cost" });
    return base;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-400" /> Revenue Management
        </h1>
        <Button onClick={() => {
          const rule = defaults.find(d => d.format === "ebook");
          setOverrideForm({
            book_id: "", format: "ebook",
            writer_percentage: rule?.writer_percentage || 35,
            publisher_percentage: rule?.publisher_percentage || 30,
            narrator_percentage: 0,
            platform_percentage: rule?.platform_percentage || 35,
            fulfillment_cost_percentage: 0,
          });
          setOverrideOpen(true);
        }}>
          <Settings className="h-4 w-4 mr-2" /> Per-Book Override
        </Button>
      </div>

      {/* Revenue Dashboard Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Sales", value: `৳${stats.totalSales.toFixed(0)}`, icon: TrendingUp, color: "text-primary" },
          { label: "Platform Earnings", value: `৳${stats.platformEarnings.toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
          { label: "Writer Payouts", value: `৳${stats.writerPayouts.toFixed(0)}`, icon: Users, color: "text-blue-400" },
          { label: "Publisher Payouts", value: `৳${stats.publisherPayouts.toFixed(0)}`, icon: Package, color: "text-purple-400" },
          { label: "Narrator Payouts", value: `৳${stats.narratorPayouts.toFixed(0)}`, icon: Headphones, color: "text-orange-400" },
          { label: "Pending Withdrawals", value: `৳${stats.pendingWithdrawals.toFixed(0)}`, icon: Wallet, color: "text-yellow-400" },
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

      {/* Default Rules */}
      <Card>
        <CardHeader><CardTitle className="text-base">Default Revenue Rules by Format</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {defaults.map((rule, idx) => (
              <Card key={rule.format} className="bg-secondary/50 border-border/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {formatIcon(rule.format)}
                    <span>{formatLabel(rule.format)}</span>
                  </div>
                  {fieldsForFormat(rule.format).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Label className="text-xs w-28">{label}</Label>
                      <Input type="number" min={0} max={100} step={1} className="h-8 w-20 text-sm"
                        value={(rule as any)[key]}
                        onChange={(e) => updateDefault(idx, key, Number(e.target.value))} />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  ))}
                  <div className={`text-xs font-medium ${Math.abs(getTotal(rule) - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                    Total: {getTotal(rule)}%
                    {rule.format === "hardcopy" && <span className="ml-1">(incl. fulfillment)</span>}
                  </div>
                  <Button size="sm" className="w-full" onClick={() => saveDefault(rule)} disabled={saving || Math.abs(getTotal(rule) - 100) > 0.01}>
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Earning Books & Contributors side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Top Earning Books</CardTitle></CardHeader>
          <CardContent>
            {topBooks.length > 0 ? (
              <div className="space-y-2">
                {topBooks.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[200px]">{b.title}</span>
                    <span className="font-semibold text-emerald-400">৳{b.total.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-blue-400" /> Top Contributors</CardTitle></CardHeader>
          <CardContent>
            {topContributors.length > 0 ? (
              <div className="space-y-2">
                {topContributors.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{c.role}</Badge>
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{c.userId.slice(0, 8)}...</span>
                    </div>
                    <span className="font-semibold text-emerald-400">৳{c.total.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>}
          </CardContent>
        </Card>
      </div>

      {/* Per-Book Overrides */}
      <Card>
        <CardHeader><CardTitle className="text-base">Per-Book Revenue Overrides</CardTitle></CardHeader>
        <CardContent>
          {bookSplits.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Writer</TableHead>
                  <TableHead>Publisher</TableHead>
                  <TableHead>Narrator</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Fulfillment</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookSplits.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium max-w-[120px] truncate">{s.books?.title || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{s.format}</Badge></TableCell>
                    <TableCell>{s.writer_percentage}%</TableCell>
                    <TableCell>{s.publisher_percentage}%</TableCell>
                    <TableCell>{s.narrator_percentage > 0 ? `${s.narrator_percentage}%` : "—"}</TableCell>
                    <TableCell>{s.platform_percentage}%</TableCell>
                    <TableCell>{s.fulfillment_cost_percentage > 0 ? `${s.fulfillment_cost_percentage}%` : "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => deleteOverride(s.id)}>Remove</Button>
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

      {/* Recent Earnings Ledger */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Transactions</CardTitle></CardHeader>
        <CardContent>
          {earnings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sale</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map((e: any) => (
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

      {/* Override Dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Set Revenue Split for Book</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Book</Label>
              <Select value={overrideForm.book_id} onValueChange={(v) => setOverrideForm({ ...overrideForm, book_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
                <SelectContent>{books.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Format</Label>
              <Select value={overrideForm.format} onValueChange={(v) => {
                loadDefaultForFormat(v);
              }}>
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
            <Button className="w-full" onClick={saveOverride} disabled={saving || Math.abs(getTotal(overrideForm) - 100) > 0.01}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Override
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
