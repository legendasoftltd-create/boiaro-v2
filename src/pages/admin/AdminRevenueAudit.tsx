import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Search, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  isVerifiedRevenueOrder,
  type RevenueOrder,
} from "@/hooks/useUnifiedRevenue";

interface AuditResult {
  order: any | null;
  payment: any | null;
  ledgerEntries: any[];
  orderItems: any[];
  revenueIncluded: boolean;
  exclusionReason: string | null;
  issues: string[];
}

function OrderAuditTool() {
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const audit = async () => {
    const q = orderId.trim();
    if (!q) { toast.error("Enter an order ID or order number"); return; }
    setLoading(true);
    setResult(null);

    try {
      // Find order by id or order_number
      let orderData: any = null;
      const { data: byId } = await supabase.from("orders").select("*").eq("id", q).maybeSingle();
      if (byId) {
        orderData = byId;
      } else {
        const { data: byNum } = await supabase.from("orders").select("*").eq("order_number", q).maybeSingle();
        orderData = byNum;
      }

      if (!orderData) {
        toast.error("Order not found");
        setLoading(false);
        return;
      }

      // Fetch payment, ledger, items in parallel
      const [payRes, ledRes, itemRes] = await Promise.all([
        supabase.from("payments").select("*").eq("order_id", orderData.id),
        supabase.from("accounting_ledger" as any).select("*").eq("order_id", orderData.id),
        supabase.from("order_items").select("*, books(title)").eq("order_id", orderData.id),
      ]);

      const payment = (payRes.data || [])[0] || null;
      const ledgerEntries = (ledRes.data as any[]) || [];
      const orderItems = itemRes.data || [];

      // Check revenue inclusion using centralized logic
      const revenueOrder: RevenueOrder = {
        id: orderData.id,
        total_amount: orderData.total_amount,
        status: orderData.status,
        created_at: orderData.created_at,
        payment_method: orderData.payment_method,
        cod_payment_status: orderData.cod_payment_status,
      };

      // Capture exclusion reason via console
      let exclusionReason: string | null = null;
      const origDebug = console.debug;
      console.debug = (...args: any[]) => {
        if (args[0] === "[revenue_exclude]" && args[1]) {
          exclusionReason = args[1].reason || null;
        }
        origDebug(...args);
      };
      const revenueIncluded = isVerifiedRevenueOrder(revenueOrder, true);
      console.debug = origDebug;

      // Detect issues
      const issues: string[] = [];
      const incomeEntries = ledgerEntries.filter(e => e.type === "income" && e.category === "book_sale");
      if (incomeEntries.length === 0 && revenueIncluded) {
        issues.push("Order is verified revenue but has NO ledger income entry — missing ledger sync");
      }
      if (incomeEntries.length > 1) {
        issues.push(`Duplicate ledger income entries found: ${incomeEntries.length} entries (expected 1)`);
      }
      if (!payment && orderData.payment_method !== "cod") {
        issues.push("No payment record found for non-COD order");
      }
      if (payment && payment.status === "paid" && !revenueIncluded) {
        issues.push("Payment is 'paid' but order is excluded from revenue — order status mismatch");
      }
      if (orderData.payment_method === "cod" && orderData.status === "delivered" && !orderData.cod_payment_status?.includes("settled")) {
        issues.push("COD order delivered but cod_payment_status not settled");
      }

      setResult({ order: orderData, payment, ledgerEntries, orderItems, revenueIncluded, exclusionReason, issues });
    } catch (err: any) {
      toast.error(err.message || "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  const autoFixOrder = async () => {
    if (!result?.order) return;
    setFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke("revenue-audit-fix", {
        body: { action: "fix_order", order_id: result.order.id },
      });
      if (error) throw error;
      const fixes = data?.fixes || [];
      if (fixes.length === 0) {
        toast.info("No auto-fixable issues found");
      } else {
        toast.success(`Fixed ${fixes.length} issue(s): ${fixes.join("; ")}`);
        // Re-run audit to refresh
        await audit();
      }
    } catch (err: any) {
      toast.error(err.message || "Auto-fix failed");
    } finally {
      setFixing(false);
    }
  };

  return (
    <Card className="border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="h-5 w-5" /> Order Audit Tool
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter Order ID or Order Number (e.g. BOI-20260401-0001)"
            value={orderId}
            onChange={e => setOrderId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && audit()}
            className="flex-1"
          />
          <Button onClick={audit} disabled={loading}>
            {loading ? "Checking..." : "Audit"}
          </Button>
        </div>

        {result && (
          <div className="space-y-4">
            {/* Issues Banner */}
            {result.issues.length > 0 ? (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
                <p className="font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> {result.issues.length} Issue(s) Found
                </p>
                {result.issues.map((issue, i) => (
                  <p key={i} className="text-sm text-destructive/80">• {issue}</p>
                ))}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={autoFixOrder}
                  disabled={fixing}
                  className="mt-1"
                >
                  <Wrench className="h-3.5 w-3.5 mr-1.5" />
                  {fixing ? "Fixing..." : "Auto Fix Issues"}
                </Button>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <p className="font-semibold text-emerald-500 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> All checks passed — no issues
                </p>
              </div>
            )}

            {/* Order Data */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-border/20">
                <CardContent className="p-4 space-y-2">
                  <h4 className="font-semibold text-sm">Order</h4>
                  <DataRow label="Order Number" value={result.order.order_number} />
                  <DataRow label="Status" value={<Badge variant="outline">{result.order.status}</Badge>} />
                  <DataRow label="Amount" value={`৳${result.order.total_amount}`} />
                  <DataRow label="Payment Method" value={result.order.payment_method} />
                  {result.order.payment_method === "cod" && (
                    <DataRow label="COD Status" value={result.order.cod_payment_status || "—"} />
                  )}
                  <DataRow label="Created" value={new Date(result.order.created_at).toLocaleString()} />
                </CardContent>
              </Card>

              <Card className="border-border/20">
                <CardContent className="p-4 space-y-2">
                  <h4 className="font-semibold text-sm">Payment</h4>
                  {result.payment ? (
                    <>
                      <DataRow label="Payment Status" value={<Badge variant="outline">{result.payment.status}</Badge>} />
                      <DataRow label="Method" value={result.payment.method} />
                      <DataRow label="Amount" value={`৳${result.payment.amount}`} />
                      <DataRow label="Transaction ID" value={result.payment.transaction_id || "—"} />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No payment record</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Revenue Status */}
            <Card className="border-border/20">
              <CardContent className="p-4 space-y-2">
                <h4 className="font-semibold text-sm">Revenue Verification (isVerifiedRevenueOrder)</h4>
                <DataRow
                  label="Included in Revenue"
                  value={
                    result.revenueIncluded
                      ? <span className="text-emerald-500 font-medium flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Yes</span>
                      : <span className="text-destructive font-medium flex items-center gap-1"><XCircle className="h-4 w-4" /> No</span>
                  }
                />
                {result.exclusionReason && (
                  <DataRow label="Exclusion Reason" value={<span className="text-destructive">{result.exclusionReason}</span>} />
                )}
              </CardContent>
            </Card>

            {/* Ledger Entries */}
            <Card className="border-border/20">
              <CardContent className="p-4 space-y-2">
                <h4 className="font-semibold text-sm">Ledger Entries ({result.ledgerEntries.length})</h4>
                {result.ledgerEntries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.ledgerEntries.map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell><Badge variant="outline">{e.type}</Badge></TableCell>
                          <TableCell className="text-sm">{e.category}</TableCell>
                          <TableCell className={`font-medium ${e.type === "income" ? "text-emerald-500" : "text-destructive"}`}>
                            ৳{Number(e.amount).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">{e.entry_date}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{e.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No ledger entries for this order</p>
                )}
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card className="border-border/20">
              <CardContent className="p-4 space-y-2">
                <h4 className="font-semibold text-sm">Order Items ({result.orderItems.length})</h4>
                {result.orderItems.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Book</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.orderItems.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.books?.title || item.book_id}</TableCell>
                          <TableCell><Badge variant="outline">{item.format}</Badge></TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>৳{item.unit_price}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No items</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Daily consistency check: orders revenue vs ledger income */
function ConsistencyCheck() {
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState<{
    orderRevenue: number;
    ledgerIncome: number;
    mismatch: boolean;
    missingFromLedger: any[];
    duplicateInLedger: any[];
  } | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const [ordRes, ledRes] = await Promise.all([
        supabase.from("orders").select("id, total_amount, status, payment_method, cod_payment_status, created_at, order_number"),
        supabase.from("accounting_ledger" as any).select("*").eq("type", "income").eq("category", "book_sale"),
      ]);

      const orders = ordRes.data || [];
      const ledger = (ledRes.data as any[]) || [];

      // Verified revenue orders
      const verifiedOrders = orders.filter(o =>
        isVerifiedRevenueOrder({
          id: o.id, total_amount: o.total_amount, status: o.status,
          created_at: o.created_at, payment_method: o.payment_method,
          cod_payment_status: o.cod_payment_status,
        })
      );
      const orderRevenue = verifiedOrders.reduce((s, o) => s + Number(o.total_amount), 0);

      // Ledger income (only positive, exclude reversals)
      const positiveLedger = ledger.filter(e => Number(e.amount) > 0);
      const ledgerIncome = positiveLedger.reduce((s, e) => s + Number(e.amount), 0);

      // Find orders missing from ledger
      const ledgerOrderIds = new Set(positiveLedger.map(e => e.order_id).filter(Boolean));
      const missingFromLedger = verifiedOrders.filter(o => !ledgerOrderIds.has(o.id));

      // Find duplicate ledger entries
      const seen = new Map<string, any>();
      const duplicateInLedger: any[] = [];
      positiveLedger.forEach(e => {
        if (e.order_id) {
          if (seen.has(e.order_id)) {
            duplicateInLedger.push(e);
          } else {
            seen.set(e.order_id, e);
          }
        }
      });

      const mismatch = Math.abs(orderRevenue - ledgerIncome) > 0.01;
      setResult({ orderRevenue, ledgerIncome, mismatch, missingFromLedger, duplicateInLedger });

      // Log mismatch to system_logs
      if (mismatch) {
        await supabase.from("system_logs").insert({
          level: "warning",
          module: "revenue_audit",
          message: `Revenue mismatch: orders=৳${orderRevenue}, ledger=৳${ledgerIncome}, diff=৳${Math.abs(orderRevenue - ledgerIncome)}`,
          fingerprint: "rev_audit_" + new Date().toISOString().slice(0, 10),
          metadata: {
            order_revenue: orderRevenue,
            ledger_income: ledgerIncome,
            missing_count: missingFromLedger.length,
            duplicate_count: duplicateInLedger.length,
          },
        });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" /> Revenue Consistency Check
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Compares total verified order revenue against accounting ledger income to detect mismatches, missing entries, or duplicates.
        </p>
        <Button onClick={runCheck} disabled={loading}>
          {loading ? "Running..." : "Run Consistency Check"}
        </Button>

        {result && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${result.mismatch ? "bg-destructive/10 border-destructive/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Orders Revenue</p>
                  <p className="text-xl font-bold">৳{result.orderRevenue.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ledger Income</p>
                  <p className="text-xl font-bold">৳{result.ledgerIncome.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Difference</p>
                  <p className={`text-xl font-bold ${result.mismatch ? "text-destructive" : "text-emerald-500"}`}>
                    ৳{Math.abs(result.orderRevenue - result.ledgerIncome).toLocaleString()}
                  </p>
                </div>
              </div>
              <p className={`text-center mt-2 text-sm font-medium ${result.mismatch ? "text-destructive" : "text-emerald-500"}`}>
                {result.mismatch ? "⚠ MISMATCH DETECTED — logged to system" : "✓ Revenue is consistent"}
              </p>
            </div>

            {/* Auto Fix All Button */}
            {(result.missingFromLedger.length > 0 || result.duplicateInLedger.length > 0) && (
              <Button
                variant="destructive"
                onClick={async () => {
                  setFixing(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("revenue-audit-fix", {
                      body: {
                        action: "bulk_fix",
                        missing_orders: result.missingFromLedger.map(o => ({ id: o.id, order_number: o.order_number, total_amount: o.total_amount })),
                        duplicate_ledger_ids: result.duplicateInLedger.map(e => e.id),
                      },
                    });
                    if (error) throw error;
                    const fixes = data?.fixes || [];
                    toast.success(`Bulk fix complete: ${fixes.length} fix(es) applied`);
                    await runCheck();
                  } catch (err: any) {
                    toast.error(err.message || "Bulk fix failed");
                  } finally {
                    setFixing(false);
                  }
                }}
                disabled={fixing}
              >
                <Wrench className="h-4 w-4 mr-2" />
                {fixing ? "Fixing..." : `Auto Fix All Issues (${result.missingFromLedger.length + result.duplicateInLedger.length})`}
              </Button>
            )}

            {result.missingFromLedger.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-destructive mb-2">
                  Missing from Ledger ({result.missingFromLedger.length})
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.missingFromLedger.map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-sm">{o.order_number || o.id}</TableCell>
                        <TableCell>৳{Number(o.total_amount).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {result.duplicateInLedger.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-destructive mb-2">
                  Duplicate Ledger Entries ({result.duplicateInLedger.length})
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.duplicateInLedger.map((e: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-mono">{(e.order_id || "").slice(0, 8)}</TableCell>
                        <TableCell>৳{Number(e.amount).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{e.entry_date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminRevenueAudit() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revenue Audit</h1>
        <p className="text-sm text-muted-foreground">
          Debug individual orders and verify revenue consistency across orders and ledger
        </p>
      </div>
      <OrderAuditTool />
      <ConsistencyCheck />
    </div>
  );
}
