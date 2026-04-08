import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TrendingDown, TrendingUp, AlertTriangle, Package, Info } from "lucide-react";

interface OrderProfitBreakdownProps {
  items: any[];
  shippingCost: number;
  packagingCost?: number;
  fulfillmentCost?: number;
  orderPurchaseCost?: number;
  isPurchased?: boolean;
}

export function OrderProfitBreakdown({
  items,
  shippingCost,
  packagingCost = 0,
  fulfillmentCost = 0,
  orderPurchaseCost,
  isPurchased,
}: OrderProfitBreakdownProps) {
  const [formatData, setFormatData] = useState<Record<string, any>>({});

  const hardcopyItems = items.filter((i) => i.format === "hardcopy");

  useEffect(() => {
    if (!hardcopyItems.length) return;
    const bookIds = [...new Set(hardcopyItems.map((i) => i.book_id))];
    supabase
      .from("book_formats")
      .select("book_id, format, original_price, discount, publisher_commission_percent, unit_cost")
      .in("book_id", bookIds)
      .eq("format", "hardcopy")
      .then(({ data }) => {
        const map: Record<string, any> = {};
        (data || []).forEach((f) => { map[f.book_id] = f; });
        setFormatData(map);
      });
  }, [items]);

  if (!hardcopyItems.length) return null;

  // Use order-based purchase cost if marked as purchased
  const useOrderCost = isPurchased && orderPurchaseCost != null && orderPurchaseCost > 0;

  let totalBuying = 0;
  let totalSelling = 0;

  const rows = hardcopyItems.map((item) => {
    const fmt = formatData[item.book_id];
    const qty = item.quantity || 1;
    const sellingPrice = item.unit_price || 0;

    let buyingPrice: number;
    if (useOrderCost) {
      buyingPrice = orderPurchaseCost!;
    } else if (fmt?.unit_cost) {
      buyingPrice = fmt.unit_cost;
    } else {
      const origPrice = fmt?.original_price || item.unit_price || 0;
      const commission = fmt?.publisher_commission_percent || 0;
      buyingPrice = origPrice - (origPrice * commission) / 100;
    }

    totalBuying += buyingPrice * qty;
    totalSelling += sellingPrice * qty;

    return { ...item, buyingPrice, sellingPrice, qty };
  });

  const grossProfit = totalSelling - totalBuying;
  const totalDeductions = packagingCost + fulfillmentCost;
  const netOrderProfit = grossProfit - totalDeductions;

  return (
    <div className="border-t pt-3 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Package className="w-4 h-4 text-orange-400" />
        Hard Copy Order Profit
        {useOrderCost && (
          <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px]">Order-Based Cost</Badge>
        )}
        {!useOrderCost && (
          <Badge variant="outline" className="text-[9px]">Stock-Based Cost</Badge>
        )}
      </h3>

      <div className="flex gap-2 p-2 rounded-md bg-muted/50 text-[10px] text-muted-foreground">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>Delivery ৳{shippingCost} is paid by customer — not deducted from merchant profit.</span>
      </div>

      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-4 gap-1 text-xs">
            <span className="truncate">{r.books?.title || "Book"}</span>
            <span className="text-right text-muted-foreground">Buy ৳{r.buyingPrice.toFixed(0)} × {r.qty}</span>
            <span className="text-right text-muted-foreground">Sell ৳{r.sellingPrice.toFixed(0)} × {r.qty}</span>
            <span className="text-right font-medium">৳{((r.sellingPrice - r.buyingPrice) * r.qty).toFixed(0)}</span>
          </div>
        ))}
      </div>

      <Separator className="opacity-30" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="text-muted-foreground">Total Buying</div>
        <div className="text-right">৳{totalBuying.toFixed(0)}</div>
        <div className="text-muted-foreground">Total Selling</div>
        <div className="text-right">৳{totalSelling.toFixed(0)}</div>
        <div className="text-muted-foreground">Gross Profit</div>
        <div className={`text-right font-medium ${grossProfit < 0 ? "text-destructive" : ""}`}>৳{grossProfit.toFixed(0)}</div>
        <div className="text-muted-foreground">Customer Delivery (info)</div>
        <div className="text-right text-muted-foreground">৳{shippingCost} (customer-paid)</div>
        <div className="text-muted-foreground">Packaging Cost</div>
        <div className="text-right">−৳{packagingCost}</div>
        {fulfillmentCost > 0 && <>
          <div className="text-muted-foreground">Fulfillment Cost</div>
          <div className="text-right">−৳{fulfillmentCost}</div>
        </>}
      </div>

      <Separator className="opacity-30" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {netOrderProfit < 0 ? (
            <TrendingDown className="h-4 w-4 text-destructive" />
          ) : (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          )}
          Net Merchant Profit
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold ${netOrderProfit < 0 ? "text-destructive" : "text-emerald-500"}`}>
            ৳{netOrderProfit.toFixed(0)}
          </span>
          {netOrderProfit < 0 && (
            <Badge variant="destructive" className="text-[9px]">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Loss
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
