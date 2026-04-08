import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

interface Plan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price: number;
  billing_type: string;
  access_type: string;
  is_featured: boolean;
  trial_days: number;
  benefits: string[];
}

interface UserSub {
  id: string;
  plan_id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  subscription_plans: { name: string; code: string } | null;
}

const billingLabels: Record<string, string> = { monthly: "/mo", yearly: "/yr", lifetime: " once" };

export default function Subscriptions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeSub, setActiveSub] = useState<UserSub | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadPlans = async () => {
      const { data } = await supabase
        .from("subscription_plans" as any)
        .select("*")
        .eq("status", "active")
        .order("sort_order");
      setPlans((data as any[] || []) as Plan[]);
    };
    loadPlans();
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadSub = async () => {
      const { data } = await supabase
        .from("user_subscriptions" as any)
        .select("*, subscription_plans(name, code)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      const list = (data as any[] || []) as UserSub[];
      setActiveSub(list[0] || null);
    };
    loadSub();
  }, [user]);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    const { data } = await supabase
      .from("coupons" as any)
      .select("*")
      .eq("code", couponCode.toUpperCase())
      .eq("status", "active")
      .single();
    const coupon = data as any;
    if (!coupon) { toast.error("Invalid coupon code"); return; }
    const now = new Date();
    if (coupon.end_date && new Date(coupon.end_date) < now) { toast.error("Coupon expired"); return; }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) { toast.error("Coupon usage limit reached"); return; }
    if (coupon.applies_to !== "all" && coupon.applies_to !== "subscription") { toast.error("Coupon not valid for subscriptions"); return; }

    const plan = plans.find(p => p.id === selectedPlan);
    if (!plan) { toast.error("Select a plan first"); return; }
    if (coupon.min_order_amount > 0 && plan.price < coupon.min_order_amount) {
      toast.error(`Minimum ৳${coupon.min_order_amount} required`); return;
    }

    const discount = coupon.discount_type === "percentage"
      ? Math.min(plan.price, (plan.price * coupon.discount_value) / 100)
      : Math.min(plan.price, coupon.discount_value);
    setCouponDiscount(discount);
    setCouponApplied(true);
    toast.success(`Coupon applied! ৳${discount} off`);
  };

  const subscribe = async (planId: string) => {
    if (!user) { navigate("/auth"); return; }
    setLoading(true);
    try {
      const plan = plans.find(p => p.id === planId);
      if (!plan) throw new Error("Plan not found");

      const now = new Date();
      let endDate: Date | null = null;
      if (plan.billing_type === "monthly") { endDate = new Date(now); endDate.setMonth(endDate.getMonth() + 1); }
      else if (plan.billing_type === "yearly") { endDate = new Date(now); endDate.setFullYear(endDate.getFullYear() + 1); }

      const finalAmount = Math.max(0, plan.price - (selectedPlan === planId ? couponDiscount : 0));

      const { error } = await supabase.from("user_subscriptions" as any).insert({
        user_id: user.id,
        plan_id: planId,
        start_date: now.toISOString(),
        end_date: endDate?.toISOString() || null,
        status: "active",
        coupon_code: couponApplied && selectedPlan === planId ? couponCode.toUpperCase() : null,
        discount_amount: selectedPlan === planId ? couponDiscount : 0,
        amount_paid: finalAmount,
      } as any);

      if (error) throw error;

      // Track coupon usage
      if (couponApplied && selectedPlan === planId) {
        const { data: couponData } = await supabase
          .from("coupons" as any)
          .select("id, used_count")
          .eq("code", couponCode.toUpperCase())
          .single();
        if (couponData) {
          const c = couponData as any;
          await supabase.from("coupon_usage" as any).insert({
            coupon_id: c.id, user_id: user.id, discount_amount: couponDiscount,
          } as any);
          await supabase.from("coupons" as any).update({ used_count: c.used_count + 1 } as any).eq("id", c.id);
        }
      }

      toast.success("Subscription activated!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to subscribe");
    } finally {
      setLoading(false);
    }
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
                <p className="text-lg font-bold text-primary">{(activeSub.subscription_plans as any)?.name}</p>
                {activeSub.end_date && (
                  <p className="text-xs text-muted-foreground">Expires: {new Date(activeSub.end_date).toLocaleDateString()}</p>
                )}
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400">Active</Badge>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {plans.map(plan => {
            const isSelected = selectedPlan === plan.id;
            const finalPrice = isSelected && couponApplied ? Math.max(0, plan.price - couponDiscount) : plan.price;
            const benefits = Array.isArray(plan.benefits) ? plan.benefits : [];
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
                    <span className="text-muted-foreground text-sm">{billingLabels[plan.billing_type]}</span>
                  </div>
                  {plan.trial_days > 0 && (
                    <Badge variant="outline" className="text-xs">{plan.trial_days} days free trial</Badge>
                  )}
                  <ul className="space-y-2">
                    {benefits.map((b, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.is_featured ? "default" : "outline"}
                    disabled={loading || (activeSub?.plan_id === plan.id)}
                    onClick={(e) => { e.stopPropagation(); subscribe(plan.id); }}
                  >
                    {activeSub?.plan_id === plan.id ? "Current Plan" : "Subscribe"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {plans.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No subscription plans available yet.
            </div>
          )}
        </div>

        {plans.length > 0 && (
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
