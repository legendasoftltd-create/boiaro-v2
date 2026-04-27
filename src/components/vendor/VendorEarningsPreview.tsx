import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, TrendingUp, Info } from "lucide-react";

interface VendorEarningsPreviewProps {
  bookId: string;
  format: "ebook" | "audiobook" | "hardcopy";
  basePrice: number;
  role: "writer" | "publisher" | "narrator";
}

export function VendorEarningsPreview({ bookId, format, basePrice, role }: VendorEarningsPreviewProps) {
  const { data, isLoading } = trpc.profiles.revenuePreview.useQuery(
    { bookId, format },
    { enabled: !!bookId && !!format }
  );

  if (isLoading || !data?.rule || basePrice <= 0) return null;

  const { rule, original_price, discount } = data;

  const rolePercentageMap: Record<string, number> = {
    writer: rule.writer_percentage,
    publisher: rule.publisher_percentage,
    narrator: rule.narrator_percentage,
  };

  const mySharePct = rolePercentageMap[role] || 0;

  let finalPrice = basePrice;
  if (discount && discount > 0) {
    finalPrice = basePrice * (1 - discount / 100);
  }

  const estimatedEarning = finalPrice * (mySharePct / 100);
  const platformPct = rule.platform_percentage;
  const fulfillmentPct = rule.fulfillment_cost_percentage;
  const roleLabel = role === "writer" ? "Author" : role === "publisher" ? "Publisher" : "Narrator";

  return (
    <Card className="border-border/30 bg-accent/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-primary" />
          Earnings Preview
          <Badge variant="outline" className="text-[9px] ml-auto capitalize">{roleLabel}</Badge>
        </div>

        <Separator className="opacity-30" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="text-muted-foreground">Original Price</div>
          <div className="text-right font-medium">৳{basePrice.toFixed(0)}</div>

          {discount && discount > 0 ? (
            <>
              <div className="text-muted-foreground">Admin Discount</div>
              <div className="text-right text-destructive">-{discount}%</div>
            </>
          ) : null}

          <div className="text-muted-foreground font-medium">Final Selling Price</div>
          <div className="text-right font-semibold">৳{finalPrice.toFixed(0)}</div>
        </div>

        <Separator className="opacity-30" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div className="text-muted-foreground">My Share ({roleLabel})</div>
          <div className="text-right font-medium text-primary">{mySharePct}%</div>

          <div className="text-muted-foreground">Platform Share</div>
          <div className="text-right">{platformPct}%</div>

          {fulfillmentPct > 0 && (
            <>
              <div className="text-muted-foreground">Fulfillment Cost</div>
              <div className="text-right">{fulfillmentPct}%</div>
            </>
          )}
        </div>

        <Separator className="opacity-30" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            Estimated Earning / Sale
          </div>
          <span className="text-lg font-bold text-emerald-500">৳{estimatedEarning.toFixed(0)}</span>
        </div>

        <p className="text-[10px] text-muted-foreground flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          Royalty percentages are set by admin. Actual earnings may vary based on discounts and promotions.
        </p>
      </CardContent>
    </Card>
  );
}
