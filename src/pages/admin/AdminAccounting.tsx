import { useEffect, useState, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, TrendingUp, TrendingDown, Wallet, Undo2 } from "lucide-react";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useAdminLogger } from "@/hooks/useAdminLogger";

const LEDGER_CATEGORIES = ["creator_payout", "gateway_fee", "server_cost", "marketing", "development", "inventory_cost", "delivery_cost", "office_expense", "other"];

export default function AdminAccounting() {
  const { user } = useAuth();
  const { log } = useAdminLogger();
  const [entries, setEntries] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "expense" as "income" | "expense",
    category: "other",
    description: "",
    amount: "",
    entry_date: new Date().toISOString().split("T")[0],
  });

  const load = async () => {
    const { data, error } = await supabase
      .from("accounting_ledger")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { console.error("[Ledger] Load error:", error); }
    setEntries(data || []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (!user) { toast.error("You must be logged in"); return; }

    const payload = {
      type: form.type,
      category: form.category,
      description: form.description || null,
      amount: Number(form.amount),
      entry_date: form.entry_date,
      source: "manual",
      created_by: user.id,
      reference_type: "manual_entry",
    };

    console.log("[Ledger] Creating manual entry:", payload, "user:", user.id);

    const { data, error } = await supabase.from("accounting_ledger").insert(payload).select();
    if (error) { console.error("[Ledger] Insert error:", error); toast.error(error.message); return; }

    console.log("[Ledger] Entry created successfully:", data);

    await log({
      module: "accounting",
      action: `Manual ${form.type} entry: ৳${form.amount} (${form.category})`,
      actionType: "create",
      targetType: "ledger_entry",
      details: form.description || `Manual ${form.type} - ${form.category}`,
      newValue: { type: form.type, category: form.category, amount: form.amount },
      riskLevel: Number(form.amount) > 10000 ? "high" : "medium",
    });

    toast.success("Entry added — reflected across all reports");
    setOpen(false);
    setForm({ type: "expense", category: "other", description: "", amount: "", entry_date: new Date().toISOString().split("T")[0] });
    load();
  };

  const reverseEntry = async (entry: any) => {
    if (!confirm(`Reverse this ${entry.type} entry of ৳${Number(entry.amount).toLocaleString()}? A counter-entry will be created.`)) return;
    if (!user) return;

    setReversingId(entry.id);

    const reversalType = entry.type;
    const { error } = await supabase.from("accounting_ledger").insert({
      type: reversalType,
      category: entry.category,
      description: `REVERSAL: ${entry.description || entry.category} (original: ${entry.id.slice(0, 8)})`,
      amount: -(Number(entry.amount)),
      entry_date: new Date().toISOString().split("T")[0],
      source: "manual",
      created_by: user.id,
      reference_type: "reversal",
      reference_id: entry.id,
    });

    if (error) { toast.error(error.message); setReversingId(null); return; }

    await log({
      module: "accounting",
      action: `Reversed ${entry.type} entry: ৳${entry.amount}`,
      actionType: "reversal",
      targetType: "ledger_entry",
      targetId: entry.id,
      oldValue: { type: entry.type, amount: entry.amount, category: entry.category },
      riskLevel: "high",
    });

    toast.success("Entry reversed — counter-entry created");
    setReversingId(null);
    load();
  };

  const filtered = entries.filter((e) => {
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(e.description || "").toLowerCase().includes(q) && !(e.category || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalIncome = entries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const netBalance = totalIncome - totalExpense;

  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; income: number; expense: number }> = {};
    entries.forEach((e) => {
      const m = (e.entry_date || "").substring(0, 7);
      if (!m) return;
      if (!months[m]) months[m] = { month: m, income: 0, expense: 0 };
      if (e.type === "income") months[m].income += Number(e.amount);
      else months[m].expense += Number(e.amount);
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [entries]);

  const isReversal = (e: any) => e.reference_type === "reversal" || Number(e.amount) < 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounting Ledger</h1>
          <p className="text-sm text-muted-foreground">Single source of truth — synced across all reports</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Entry</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
             <div>
              <p className="text-2xl font-bold">৳{totalIncome.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Ledger Income</p>
              <p className="text-[10px] text-muted-foreground/60">All sources: orders, manual, adjustments</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10">
              <TrendingDown className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">৳{totalExpense.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Ledger Expense</p>
              <p className="text-[10px] text-muted-foreground/60">All recorded expenses</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${netBalance >= 0 ? "bg-primary/10" : "bg-red-500/10"}`}>
              <Wallet className={`w-5 h-5 ${netBalance >= 0 ? "text-primary" : "text-red-500"}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${netBalance < 0 ? "text-red-500" : ""}`}>৳{netBalance.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Net Ledger Balance</p>
              <p className="text-[10px] text-muted-foreground/60">Income minus expenses (full ledger)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Chart */}
      {monthlyData.length > 0 && (
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3">Monthly Income & Expense</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expense" fill="hsl(0 70% 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search entries..." className="flex-1 min-w-[200px] max-w-sm" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Ledger Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className={isReversal(e) ? "opacity-60" : ""}>
                <TableCell className="text-sm">{e.entry_date}</TableCell>
                <TableCell>
                  <Badge className={e.type === "income" ? "bg-emerald-500/20 text-emerald-400 border-0" : "bg-red-500/20 text-red-400 border-0"}>
                    {e.type === "income" ? "Income" : "Expense"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm capitalize">{(e.category || "").replace(/_/g, " ")}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{e.description || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {e.source === "manual" ? "Manual" : "Auto"}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right font-medium ${Number(e.amount) < 0 ? "text-orange-500 line-through" : e.type === "income" ? "text-emerald-500" : "text-red-500"}`}>
                  {e.type === "income" && Number(e.amount) >= 0 ? "+" : Number(e.amount) >= 0 ? "-" : ""}৳{Math.abs(Number(e.amount)).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {!isReversal(e) && Number(e.amount) > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={reversingId === e.id}
                      onClick={() => reverseEntry(e)}
                      className="text-orange-500 hover:text-orange-600"
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1" />
                      Reverse
                    </Button>
                  )}
                  {isReversal(e) && (
                    <span className="text-xs text-muted-foreground">Reversed</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No entries found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Entry Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Ledger Entry</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">This entry will be reflected across all financial reports, dashboards, and investor summaries.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v, category: "other" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEDGER_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Required for audit trail..." />
            </div>
            <Button className="w-full" onClick={save}>Save Entry</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
