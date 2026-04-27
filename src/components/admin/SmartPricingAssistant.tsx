import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calculator, Lightbulb, AlertTriangle, ArrowRight } from "lucide-react";

interface SmartPricingAssistantProps {
  originalPrice: number;
  publisherCommissionPercent: number;
  currentDiscount: number;
  packagingCost?: number;
  onApplySuggestion?: (suggestedPrice: number, suggestedDiscount: number) => void;
}

type ProfitHealth = "loss" | "low" | "medium" | "good";

function getProfitHealth(profit: number, sellingPrice: number): ProfitHealth {
  if (profit <= 0) return "loss";
  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
  if (margin < 10) return "low";
  if (margin < 25) return "medium";
  return "good";
}

const healthConfig: Record<ProfitHealth, { label: string; color: string; badgeClass: string }> = {
  loss: { label: "Loss", color: "text-destructive", badgeClass: "bg-destructive/15 text-destructive border-destructive/30" },
  low: { label: "Low Margin", color: "text-amber-500", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  medium: { label: "Fair Margin", color: "text-blue-500", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  good: { label: "Healthy", color: "text-emerald-500", badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

export function SmartPricingAssistant({
  originalPrice,
  publisherCommissionPercent,
  currentDiscount,
  packagingCost = 10,
  onApplySuggestion,
}: SmartPricingAssistantProps) {
  const [targetProfit, setTargetProfit] = useState<number | "">("");

  const calc = useMemo(() => {
    const orig = originalPrice || 0;
    const commission = publisherCommissionPercent || 0;
    const unitCost = orig - (orig * commission) / 100;
    const tp = typeof targetProfit === "number" ? targetProfit : 0;
    const suggestedSelling = unitCost + packagingCost + tp;
    const suggestedDiscount = orig > 0 ? Math.max(0, Math.round(((orig - suggestedSelling) / orig) * 100 * 100) / 100) : 0;

    // Current state
    const currentSelling = orig - (orig * (currentDiscount || 0)) / 100;
    const currentProfit = currentSelling - unitCost - packagingCost;
    const currentHealth = getProfitHealth(currentProfit, currentSelling);

    // Suggested state
    const suggestedProfit = suggestedSelling - unitCost - packagingCost;
    const suggestedHealth = getProfitHealth(suggestedProfit, suggestedSelling);

    return {
      unitCost,
      suggestedSelling: Math.round(suggestedSelling),
      suggestedDiscount: Math.max(0, suggestedDiscount),
      suggestedProfit,
      suggestedHealth,
      currentSelling,
      currentProfit,
      currentHealth,
      hasTarget: tp > 0,
    };
  }, [originalPrice, publisherCommissionPercent, currentDiscount, packagingCost, targetProfit]);

  const orig = originalPrice || 0;
  if (orig <= 0 || !publisherCommissionPercent) return null;

  const curCfg = healthConfig[calc.currentHealth];
  const sugCfg = healthConfig[calc.suggestedHealth];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          Smart Pricing Assistant
          <Badge variant="outline" className="text-[9px] ml-auto">Advisory Only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current health */}
        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
          <span className="text-xs text-muted-foreground">Current Profit Health</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${curCfg.color}`}>৳{calc.currentProfit.toFixed(0)}</span>
            <Badge variant="outline" className={`text-[9px] ${curCfg.badgeClass}`}>{curCfg.label}</Badge>
          </div>
        </div>

        {calc.currentHealth === "loss" && (
          <div className="flex gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-[10px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Current pricing results in a <strong>net loss</strong> per unit. Consider adjusting discount or commission.</span>
          </div>
        )}

        <Separator className="opacity-30" />

        {/* Target profit input */}
        <div>
          <Label className="text-xs">Target Profit Per Unit (৳)</Label>
          <Input
            type="number"
            min={0}
            step="any"
            value={targetProfit}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") { setTargetProfit(""); return; }
              const val = Number(raw);
              if (!isNaN(val) && val >= 0) setTargetProfit(val);
            }}
            placeholder="e.g. 50"
            className="h-8 text-sm mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            How much profit you want per copy sold
          </p>
        </div>

        {calc.hasTarget && (
          <>
            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div className="text-muted-foreground">Unit Cost (Buying)</div>
              <div className="text-right">৳{calc.unitCost.toFixed(0)}</div>
              <div className="text-muted-foreground">Packaging Cost</div>
              <div className="text-right">৳{packagingCost}</div>
              <div className="text-muted-foreground">Target Profit</div>
              <div className="text-right font-medium text-primary">৳{typeof targetProfit === "number" ? targetProfit : 0}</div>
            </div>

            <Separator className="opacity-30" />

            {/* Suggestion */}
            <div className="p-3 rounded-md bg-primary/10 border border-primary/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Suggested Selling Price</span>
                <span className="text-lg font-bold text-primary">৳{calc.suggestedSelling}</span>
              </div>
              {orig > 0 && calc.suggestedDiscount > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Implied Discount from MRP ৳{orig}</span>
                  <span>{calc.suggestedDiscount}%</span>
                </div>
              )}
              {orig > 0 && calc.suggestedSelling > orig && (
                <p className="text-[10px] text-amber-500">
                  ⚠ Suggested price exceeds MRP. Consider lowering target profit or adjusting commission.
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Expected Profit</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${sugCfg.color}`}>৳{calc.suggestedProfit.toFixed(0)}</span>
                  <Badge variant="outline" className={`text-[9px] ${sugCfg.badgeClass}`}>{sugCfg.label}</Badge>
                </div>
              </div>
            </div>

            {/* Apply button */}
            {onApplySuggestion && calc.suggestedSelling > 0 && calc.suggestedSelling <= orig && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={() => onApplySuggestion(calc.suggestedSelling, calc.suggestedDiscount)}
              >
                <Calculator className="h-3.5 w-3.5" />
                Apply Suggested Price
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
