import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, TrendingDown, TrendingUp, AlertTriangle, Info } from "lucide-react";

interface HardcopyProfitCalculatorProps {
  bookId: string;
  originalPrice: number;
  discountPercent: number;
  publisherCommissionPercent: number;
  onCommissionChange: (value: number) => void;
  estimatedShippingCost?: number;
  packagingCostPerOrder?: number;
}

export function HardcopyProfitCalculator({
  bookId,
  originalPrice,
  discountPercent,
  publisherCommissionPercent,
  onCommissionChange,
  estimatedShippingCost = 60,
  packagingCostPerOrder = 10,
}: HardcopyProfitCalculatorProps) {
  const utils = trpc.useUtils();
  const [merchantCourierCost, setMerchantCourierCost] = useState(0);

  const orig = originalPrice || 0;
  const commission = publisherCommissionPercent || 0;
  const buyingPrice = orig - (orig * commission) / 100;
  const sellingPrice = orig - (orig * (discountPercent || 0)) / 100;
  const perBookProfit = sellingPrice - buyingPrice;

  // Derived revenue split values for backend compatibility
  const derivedPublisherPct = commission;
  const derivedPlatformPct = 100 - commission;

  // Sync derived split to format_revenue_splits whenever commission changes
  const syncSplit = useCallback(async () => {
    if (!bookId || commission < 0 || commission > 100) return;
    const payload = {
      book_id: bookId,
      format: "hardcopy",
      writer_percentage: 0,
      narrator_percentage: 0,
      publisher_percentage: derivedPublisherPct,
      platform_percentage: derivedPlatformPct,
      fulfillment_cost_percentage: 0,
    };
    try {
      await utils.admin.upsertRevenueOverride.fetch(payload);
    } catch (error) {
      console.error("Failed to sync hardcopy revenue split:", error);
    }
  }, [bookId, commission, derivedPublisherPct, derivedPlatformPct, utils.admin.upsertRevenueOverride]);

  useEffect(() => {
    if (!bookId || commission < 0 || commission > 100) return;
    const timer = setTimeout(() => { syncSplit(); }, 1000);
    return () => clearTimeout(timer);
  }, [commission, bookId, syncSplit]);

  const missingFields = [];
  if (orig <= 0) missingFields.push("Original Price");
  if (!discountPercent && discountPercent !== 0) missingFields.push("Discount %");
  if (!commission) missingFields.push("Publisher Commission %");
  const hasMissingFields = orig <= 0 || !commission;

  // Net profit: selling - buying - packaging - merchant courier (NOT customer delivery)
  const netOrderProfit = perBookProfit - packagingCostPerOrder - merchantCourierCost;

  return (
    <Card className="border-border/30 bg-accent/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Package className="h-4 w-4 text-orange-400" />
          Hard Copy Commerce & Profit
          <Badge variant="outline" className="text-[9px] ml-auto">Commerce Model</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasMissingFields && (
          <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Set <strong>{missingFields.join(", ")}</strong> to see profit calculation</span>
          </div>
        )}
        <div className="flex gap-2 p-2 rounded-md bg-muted/50 text-[10px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Delivery charge is paid by the customer and is <strong>not deducted</strong> from merchant profit. Only packaging and optional merchant courier costs reduce profit.</span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Publisher Commission %</Label>
            <Input
              type="number" min={0} max={100} step="any"
              value={publisherCommissionPercent || ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") { onCommissionChange(0); return; }
                const val = Number(raw);
                if (isNaN(val) || val < 0 || val > 100) return;
                onCommissionChange(val);
              }}
              placeholder="e.g. 40" className="h-8 text-sm"
            />
            {publisherCommissionPercent < 0 || publisherCommissionPercent > 100 ? (
              <p className="text-[10px] text-destructive mt-0.5">Commission must be between 0% and 100%</p>
            ) : null}
            <p className="text-[10px] text-muted-foreground mt-0.5">% of original price paid to publisher</p>
          </div>
          <div>
            <Label className="text-xs">Merchant Courier Cost (৳)</Label>
            <Input
              type="number" min={0} step="any"
              value={merchantCourierCost || ""}
              onChange={(e) => {
                const val = Number(e.target.value);
                setMerchantCourierCost(isNaN(val) || val < 0 ? 0 : val);
              }}
              placeholder="0" className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Only if merchant pays courier separately
            </p>
          </div>
        </div>

        {/* Customer delivery charge — informational */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>Customer Delivery Charge (info only)</span>
          <span>৳{estimatedShippingCost}</span>
        </div>

        {!hasMissingFields && (
          <>
            <Separator className="opacity-30" />

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div className="text-muted-foreground">Original Price</div>
              <div className="text-right font-medium">৳{orig.toFixed(0)}</div>
              <div className="text-muted-foreground">Buying Price</div>
              <div className="text-right font-medium">
                ৳{buyingPrice.toFixed(0)}
                <span className="text-[10px] text-muted-foreground ml-1">({100 - commission}% of MRP)</span>
              </div>
              <div className="text-muted-foreground">Selling Price</div>
              <div className="text-right font-medium">
                ৳{sellingPrice.toFixed(0)}
                {discountPercent > 0 && <span className="text-[10px] text-destructive ml-1">-{discountPercent}%</span>}
              </div>
            </div>

            <Separator className="opacity-30" />

            {/* Per-book profit */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {perBookProfit < 0 ? <TrendingDown className="h-4 w-4 text-destructive" /> : <TrendingUp className="h-4 w-4 text-emerald-500" />}
                Per-Book Margin
              </div>
              <span className={`text-lg font-bold ${perBookProfit < 0 ? "text-destructive" : "text-emerald-500"}`}>
                ৳{perBookProfit.toFixed(0)}
              </span>
            </div>

            {/* Simulated order profit */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground">Simulated Net Profit (1 copy)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="text-muted-foreground">Per-Book Margin</div>
                <div className="text-right">৳{perBookProfit.toFixed(0)}</div>
                <div className="text-muted-foreground">Packaging (per order)</div>
                <div className="text-right">−৳{packagingCostPerOrder}</div>
                {merchantCourierCost > 0 && (
                  <>
                    <div className="text-muted-foreground">Merchant Courier Cost</div>
                    <div className="text-right">−৳{merchantCourierCost}</div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Net Order Profit</span>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-semibold ${netOrderProfit < 0 ? "text-destructive" : "text-emerald-500"}`}>
                    ৳{netOrderProfit.toFixed(0)}
                  </span>
                  {netOrderProfit < 0 && (
                    <Badge variant="destructive" className="text-[9px]">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Net Loss
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Delivery charge is customer-paid and excluded from merchant profit. Packaging cost is per order, not per book.
              </p>
            </div>

            <Separator className="opacity-30" />
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground">Auto-synced Revenue Split (for earnings calculation)</p>
              <div className="flex gap-3 text-[10px]">
                <span>Publisher: <strong>{derivedPublisherPct}%</strong></span>
                <span>Platform: <strong>{derivedPlatformPct}%</strong></span>
                <span className="text-muted-foreground">Writer: 0% · Narrator: 0%</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
