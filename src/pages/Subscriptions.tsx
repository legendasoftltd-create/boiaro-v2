import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Crown, Check, Star, Ticket } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Subscriptions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  const { data: plans = [] } = trpc.wallet.subscriptionPlans.useQuery();
  const { data: activeSub } = trpc.wallet.activeSubscription.useQuery(undefined, { enabled: !!user });
  const subscribeMutation = trpc.wallet.subscribe.useMutation({
    onSuccess: () => { toast.success("Subscription activated!"); navigate("/dashboard"); },
    onError: (err) => toast.error(err.message || "Failed to subscribe"),
  });
  const validateCouponMutation = trpc.orders.validateCoupon.useMutation();

  const applyCoupon = async () => {
    if (!couponCode.trim() || !selectedPlan) { toast.error("Select a plan first"); return; }
    const plan = (plans as any[]).find((p: any) => p.id === selectedPlan);
    if (!plan) return;
    try {
      const result = await validateCouponMutation.mutateAsync({
        code: couponCode,
        totalAmount: plan.price,
        hasHardcopy: false,
        hasEbook: false,
        hasAudiobook: false,
      });
      setCouponDiscount(result.discountAmount);
      setCouponApplied(true);
      toast.success(`Coupon applied! ৳${result.discountAmount} off`);
    } catch (err: any) {
      toast.error(err.message || "Invalid coupon");
    }
  };

  const subscribe = (planId: string) => {
    if (!user) { navigate("/auth"); return; }
    subscribeMutation.mutate({
      planId,
      couponCode: couponApplied && selectedPlan === planId ? couponCode.toUpperCase() : undefined,
      couponDiscount: couponApplied && selectedPlan === planId ? couponDiscount : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-12 max-w-5xl">
        <div className="text-center mb-12">
          <Crown className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-serif font-bold mb-2">সাবস্ক্রিপশন প্ল্যান</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            আনলিমিটেড বই পড়ুন এবং অডিওবুক শুনুন। আপনার জন্য সেরা প্ল্যানটি বেছে নিন।
          </p>
        </div>

        {activeSub && (
          <Card className="mb-8 border-primary/30 bg-primary/5">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Plan</p>
                <p className="text-lg font-bold text-primary">{(activeSub as any).plan?.name}</p>
                {activeSub.end_date && (
                  <p className="text-xs text-muted-foreground">Expires: {new Date(activeSub.end_date).toLocaleDateString()}</p>
                )}
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400">Active</Badge>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {(plans as any[]).map((plan: any) => {
            const isSelected = selectedPlan === plan.id;
            const finalPrice = isSelected && couponApplied ? Math.max(0, plan.price - couponDiscount) : plan.price;
            const benefits: string[] = Array.isArray(plan.features) ? plan.features : [];
            const durationLabel = plan.duration_days >= 365 ? "/yr" : plan.duration_days >= 28 ? "/mo" : ` / ${plan.duration_days}d`;
            return (
              <Card
                key={plan.id}
                className={`relative border transition-all cursor-pointer hover:border-primary/50 ${
                  plan.is_featured ? "border-primary shadow-lg shadow-primary/10" : "border-border"
                } ${isSelected ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.is_featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground gap-1"><Star className="w-3 h-3" /> Popular</Badge>
                  </div>
                )}
                <CardContent className="p-6 pt-8 space-y-4">
                  <div>
                    <h3 className="text-xl font-serif font-bold">{plan.name}</h3>
                    {plan.description && <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    {isSelected && couponApplied && couponDiscount > 0 && (
                      <span className="text-lg text-muted-foreground line-through mr-1">৳{plan.price}</span>
                    )}
                    <span className="text-3xl font-bold text-primary">৳{finalPrice}</span>
                    <span className="text-muted-foreground text-sm">{durationLabel}</span>
                  </div>
                  <ul className="space-y-2">
                    {benefits.map((b: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.is_featured ? "default" : "outline"}
                    disabled={subscribeMutation.isPending || (activeSub?.plan_id === plan.id)}
                    onClick={(e) => { e.stopPropagation(); subscribe(plan.id); }}
                  >
                    {activeSub?.plan_id === plan.id ? "Current Plan" : "Subscribe"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {(plans as any[]).length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No subscription plans available yet.
            </div>
          )}
        </div>

        {(plans as any[]).length > 0 && (
          <Card className="max-w-md mx-auto border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Ticket className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Have a coupon?</h3>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value); setCouponApplied(false); setCouponDiscount(0); }}
                  className="bg-secondary font-mono uppercase"
                />
                <Button onClick={applyCoupon} variant="outline" disabled={!couponCode.trim() || !selectedPlan}>
                  Apply
                </Button>
              </div>
              {!selectedPlan && couponCode && (
                <p className="text-xs text-muted-foreground mt-2">Select a plan first to apply coupon</p>
              )}
              {couponApplied && (
                <p className="text-xs text-emerald-400 mt-2">✓ Coupon applied — ৳{couponDiscount} discount</p>
              )}
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
