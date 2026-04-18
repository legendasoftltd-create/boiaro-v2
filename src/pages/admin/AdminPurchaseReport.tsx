import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Package, DollarSign, ShoppingCart, Layers, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import {
  isVerifiedRevenueOrder,
  getOrderSellableAmount,
  type RevenueOrder,
} from "@/hooks/useUnifiedRevenue";

type PeriodType = "today" | "this_month" | "last_month" | "this_year" | "custom" | "all";

function filterByPeriod(dateStr: string, period: PeriodType, dateFrom?: string, dateTo?: string): boolean {
  if (period === "all") return true;
  if (period === "custom") {
    if (dateFrom && dateStr < dateFrom) return false;
    if (dateTo && dateStr > dateTo + "T23:59:59") return false;
    return true;
  }
  const d = new Date(dateStr);
  const now = new Date();
  switch (period) {
    case "today":
      return d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    case "this_month":
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    case "last_month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }
    case "this_year":
      return d.getFullYear() === now.getFullYear();
    default:
      return true;
  }
}

export default function AdminPurchaseReport() {
  const [period, setPeriod] = useState<PeriodType>("this_month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Fetch ledger entries for inventory_purchase and cost_of_goods_sold
  const { data: ledgerEntries = [], isLoading: ledgerLoading } = useQuery({
    queryKey: ["purchase-report-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_ledger")
        .select("id, type, category, amount, entry_date, order_id, book_id, description, reference_type")
        .in("category", ["inventory_purchase", "cost_of_goods_sold"])
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch ALL hardcopy orders for profit calculation (verified revenue ones)
  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["purchase-report-all-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount, status, created_at, purchase_cost_per_unit, is_purchased, order_number, payment_method, cod_payment_status, packaging_cost, fulfillment_cost, shipping_cost")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch order items (hardcopy only) with unit_cost via book_formats
  const { data: allOrderItems = [] } = useQuery({
    queryKey: ["purchase-report-all-order-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, book_id, format, quantity, unit_price")
        .eq("format", "hardcopy");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch book_formats for unit_cost (stock-based cost)
  const { data: bookFormats = [] } = useQuery({
    queryKey: ["purchase-report-book-formats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("book_formats")
        .select("book_id, unit_cost, original_price, publisher_commission_percent")
        .eq("format", "hardcopy");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch books for names
  const { data: books = [] } = useQuery({
    queryKey: ["purchase-report-books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id, title");
      if (error) throw error;
      return data || [];
    },
  });

  const bookMap = useMemo(() => {
    const m: Record<string, string> = {};
    books.forEach(b => { m[b.id] = b.title; });
    return m;
  }, [books]);

  const unitCostMap = useMemo(() => {
    const m: Record<string, number> = {};
    bookFormats.forEach(bf => {
      if (!bf.book_id) return;
      const uc = bf.unit_cost || 0;
      if (uc > 0) { m[bf.book_id] = uc; return; }
      // Fallback: commission-based cost
      const orig = (bf as any).original_price || 0;
      const comm = (bf as any).publisher_commission_percent || 0;
      if (orig > 0 && comm > 0) m[bf.book_id] = orig - (orig * comm / 100);
    });
    return m;
  }, [bookFormats]);

  // ── PURCHASE SECTION ──

  const filteredLedger = useMemo(() => {
    return ledgerEntries.filter(e => {
      if (e.reference_type === "order_reversal") return false;
      if (e.amount < 0) return false;
      return filterByPeriod(e.entry_date, period, dateFrom, dateTo);
    });
  }, [ledgerEntries, period, dateFrom, dateTo]);

  const inventoryEntries = filteredLedger.filter(e => e.category === "inventory_purchase");
  const cogsEntries = filteredLedger.filter(e => e.category === "cost_of_goods_sold");
  const totalInventory = inventoryEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalCogs = cogsEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalPurchase = totalInventory + totalCogs;

  // Purchase qty from order_items of purchased orders
  const purchasedOrderIds = useMemo(() => {
    return new Set(
      allOrders
        .filter(o => o.is_purchased && filterByPeriod(o.created_at, period, dateFrom, dateTo))
        .map(o => o.id)
    );
  }, [allOrders, period, dateFrom, dateTo]);

  const orderQtyByBook = useMemo(() => {
    const map: Record<string, number> = {};
    allOrderItems.forEach(item => {
      if (!purchasedOrderIds.has(item.order_id)) return;
      const bk = item.book_id || "unknown";
      map[bk] = (map[bk] || 0) + (item.quantity || 1);
    });
    return map;
  }, [allOrderItems, purchasedOrderIds]);

  const totalOrderQty = Object.values(orderQtyByBook).reduce((s, v) => s + v, 0);

  // ── PROFIT SECTION (uses unified revenue logic) ──

  const profitByBook = useMemo(() => {
    const verifiedOrders = allOrders.filter(
      o => isVerifiedRevenueOrder(o as RevenueOrder) && filterByPeriod(o.created_at, period, dateFrom, dateTo)
    );

    const itemsByOrder: Record<string, typeof allOrderItems> = {};
    allOrderItems.forEach(i => {
      if (!itemsByOrder[i.order_id]) itemsByOrder[i.order_id] = [];
      itemsByOrder[i.order_id].push(i);
    });

    const map: Record<string, { revenue: number; cost: number; profit: number; soldQty: number }> = {};

    verifiedOrders.forEach(order => {
      const items = itemsByOrder[order.id] || [];
      if (items.length === 0) return;

      const sellable = getOrderSellableAmount(order as RevenueOrder);
      // Distribute sellable proportionally across items by unit_price * qty
      const totalItemValue = items.reduce((s, i) => s + (i.unit_price || 0) * (i.quantity || 1), 0);

      items.forEach(item => {
        const bk = item.book_id || "unknown";
        if (!map[bk]) map[bk] = { revenue: 0, cost: 0, profit: 0, soldQty: 0 };

        const qty = item.quantity || 1;
        const proportion = totalItemValue > 0 ? ((item.unit_price || 0) * qty) / totalItemValue : 0;
        const itemRevenue = sellable * proportion;

        let itemCost: number;
        if (order.is_purchased && (order.purchase_cost_per_unit ?? 0) > 0) {
          itemCost = (order.purchase_cost_per_unit!) * qty;
        } else {
          itemCost = (unitCostMap[bk] || 0) * qty;
        }

        const itemProfit = itemRevenue - itemCost - ((order.packaging_cost || 0) + (order.fulfillment_cost || 0)) * proportion;

        map[bk].revenue += itemRevenue;
        map[bk].cost += itemCost;
        map[bk].profit += itemProfit;
        map[bk].soldQty += qty;
      });
    });

    return map;
  }, [allOrders, allOrderItems, unitCostMap, period, dateFrom, dateTo]);

  const totalProfit = Object.values(profitByBook).reduce((s, v) => s + v.profit, 0);
  const totalRevenue = Object.values(profitByBook).reduce((s, v) => s + v.revenue, 0);

  // ── COMBINED BOOK BREAKDOWN ──

  const bookBreakdown = useMemo(() => {
    const allBookIds = new Set<string>();
    filteredLedger.forEach(e => allBookIds.add(e.book_id || "unknown"));
    Object.keys(profitByBook).forEach(id => allBookIds.add(id));
    Object.keys(orderQtyByBook).forEach(id => allBookIds.add(id));

    return Array.from(allBookIds).map(bookId => {
      const ledgerInv = filteredLedger.filter(e => (e.book_id || "unknown") === bookId && e.category === "inventory_purchase").reduce((s, e) => s + (e.amount || 0), 0);
      const ledgerCogs = filteredLedger.filter(e => (e.book_id || "unknown") === bookId && e.category === "cost_of_goods_sold").reduce((s, e) => s + (e.amount || 0), 0);
      const pData = profitByBook[bookId] || { revenue: 0, cost: 0, profit: 0, soldQty: 0 };

      return {
        bookId,
        title: bookMap[bookId] || "Unknown Book",
        inventoryAmount: ledgerInv,
        cogsAmount: ledgerCogs,
        totalPurchaseCost: ledgerInv + ledgerCogs,
        purchaseQty: orderQtyByBook[bookId] || 0,
        revenue: pData.revenue,
        profit: pData.profit,
        soldQty: pData.soldQty,
      };
    }).sort((a, b) => b.totalPurchaseCost - a.totalPurchaseCost);
  }, [filteredLedger, profitByBook, orderQtyByBook, bookMap]);

  // CSV Export
  const exportCSV = () => {
    const rows = [["Book", "Inventory (৳)", "COGS (৳)", "Total Cost (৳)", "Purchased Qty", "Revenue (৳)", "Profit (৳)", "Sold Qty"]];
    bookBreakdown.forEach(b => {
      rows.push([
        b.title,
        b.inventoryAmount.toFixed(2),
        b.cogsAmount.toFixed(2),
        b.totalPurchaseCost.toFixed(2),
        String(b.purchaseQty),
        b.revenue.toFixed(2),
        b.profit.toFixed(2),
        String(b.soldQty),
      ]);
    });
    rows.push(["TOTAL", totalInventory.toFixed(2), totalCogs.toFixed(2), totalPurchase.toFixed(2), String(totalOrderQty), totalRevenue.toFixed(2), totalProfit.toFixed(2), ""]);

    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-profit-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = ledgerLoading || ordersLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Purchase & Profit Report</h1>
          <p className="text-sm text-muted-foreground">Hardcopy book purchase costs & profit analysis</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Period</label>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
            </div>
          </>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchase Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">৳{totalPurchase.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inventory Purchase</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">৳{totalInventory.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{inventoryEntries.length} entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost of Goods Sold</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">৳{totalCogs.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{cogsEntries.length} entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Qty Purchased</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrderQty}</div>
            <p className="text-xs text-muted-foreground">hardcopy units</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue (Verified)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">৳{totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">excl. delivery</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
              ৳{totalProfit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalRevenue > 0 ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}% margin` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Book-wise Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Book-wise Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : bookBreakdown.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No purchase data for this period</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead className="text-right">Inventory (৳)</TableHead>
                    <TableHead className="text-right">COGS (৳)</TableHead>
                    <TableHead className="text-right">Total Cost (৳)</TableHead>
                    <TableHead className="text-right">Purchased Qty</TableHead>
                    <TableHead className="text-right">Revenue (৳)</TableHead>
                    <TableHead className="text-right">Profit (৳)</TableHead>
                    <TableHead className="text-right">Sold Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookBreakdown.map(b => (
                    <TableRow key={b.bookId}>
                      <TableCell className="font-medium max-w-[200px] truncate">{b.title}</TableCell>
                      <TableCell className="text-right">{b.inventoryAmount > 0 ? `৳${b.inventoryAmount.toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-right">{b.cogsAmount > 0 ? `৳${b.cogsAmount.toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">৳{b.totalPurchaseCost.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{b.purchaseQty || "—"}</TableCell>
                      <TableCell className="text-right">{b.revenue > 0 ? `৳${Math.round(b.revenue).toLocaleString()}` : "—"}</TableCell>
                      <TableCell className={`text-right font-semibold ${b.profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                        {b.revenue > 0 || b.profit !== 0 ? `৳${Math.round(b.profit).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">{b.soldQty || "—"}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">৳{totalInventory.toLocaleString()}</TableCell>
                    <TableCell className="text-right">৳{totalCogs.toLocaleString()}</TableCell>
                    <TableCell className="text-right">৳{totalPurchase.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{totalOrderQty}</TableCell>
                    <TableCell className="text-right">৳{Math.round(totalRevenue).toLocaleString()}</TableCell>
                    <TableCell className={`text-right ${totalProfit >= 0 ? "text-green-600" : "text-destructive"}`}>৳{Math.round(totalProfit).toLocaleString()}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
