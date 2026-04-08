import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = searchParams.get("status") || "unknown";
  const orderId = searchParams.get("order_id");
  const isCoinPurchase = searchParams.get("type") === "coin";
  const _purchaseId = searchParams.get("purchase_id");
  const [countdown, setCountdown] = useState(10);
  const [contentRedirect, setContentRedirect] = useState<string | null>(null);
  const [redirectLabel, setRedirectLabel] = useState<string>("");

  // On success, look up order items to determine content redirect
  useEffect(() => {
    if (status !== "success" || !orderId || isCoinPurchase) return;
    const lookupContent = async () => {
      try {
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("book_id, format")
          .eq("order_id", orderId);

        if (!orderItems || orderItems.length === 0) return;
        const digital = orderItems.find((i: any) => i.format === "ebook" || i.format === "audiobook");
        if (!digital) return;

        // Get book slug
        const { data: book } = await supabase
          .from("books")
          .select("slug")
          .eq("id", digital.book_id)
          .single();

        const slug = book?.slug || digital.book_id;
        if (digital.format === "ebook") {
          setContentRedirect(`/read/${slug}`);
          setRedirectLabel("📖 Read Now");
        } else {
          setContentRedirect(`/book/${slug}?tab=audiobook`);
          setRedirectLabel("🎧 Listen Now");
        }

        // Invalidate access caches
        queryClient.invalidateQueries({ queryKey: ["content_unlocks"] });
        queryClient.invalidateQueries({ queryKey: ["user_purchases"] });
        queryClient.invalidateQueries({ queryKey: ["content-access"] });
      } catch (e) {
        console.warn("Failed to look up order items:", e);
      }
    };
    lookupContent();
  }, [status, orderId, isCoinPurchase, queryClient]);

  const redirectTo = isCoinPurchase ? "/wallet" : contentRedirect || "/orders";

  useEffect(() => {
    if (status === "success") {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate(redirectTo);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, navigate, redirectTo]);

  const config = {
    success: {
      icon: <CheckCircle2 className="w-12 h-12 text-emerald-400" />,
      bg: "bg-emerald-500/10",
      title: isCoinPurchase ? "কয়েন ক্রয় সফল!" : "Payment Successful!",
      desc: isCoinPurchase ? "আপনার কয়েন ওয়ালেটে জমা হচ্ছে।" : "Your payment has been verified. Content is now unlocked!",
      note: `Redirecting in ${countdown}s...`,
    },
    failed: {
      icon: <AlertCircle className="w-12 h-12 text-destructive" />,
      bg: "bg-destructive/10",
      title: "Payment Failed",
      desc: "Your payment could not be processed. Please try again.",
      note: null,
    },
    cancelled: {
      icon: <XCircle className="w-12 h-12 text-amber-400" />,
      bg: "bg-amber-500/10",
      title: "Payment Cancelled",
      desc: "You cancelled the payment. Your order is still pending.",
      note: null,
    },
    unknown: {
      icon: <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />,
      bg: "bg-muted",
      title: "Processing...",
      desc: "Verifying your payment status.",
      note: null,
    },
  }[status] || {
    icon: <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />,
    bg: "bg-muted",
    title: "Processing...",
    desc: "Verifying your payment status.",
    note: null,
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-20 text-center container mx-auto px-4 max-w-md">
        <div className={`w-24 h-24 rounded-full ${config.bg} flex items-center justify-center mx-auto mb-6`}>
          {config.icon}
        </div>
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">{config.title}</h1>
        <p className="text-muted-foreground mb-2">{config.desc}</p>
        {orderId && (
          <p className="text-xs text-muted-foreground mb-4">
            Order: <span className="font-mono text-foreground">{orderId.slice(0, 8).toUpperCase()}</span>
          </p>
        )}
        {config.note && <p className="text-xs text-muted-foreground mb-6">{config.note}</p>}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {status === "success" && contentRedirect && (
            <Button onClick={() => navigate(contentRedirect)}>{redirectLabel}</Button>
          )}
          <Button variant={contentRedirect ? "outline" : "default"} onClick={() => navigate(isCoinPurchase ? "/wallet" : "/orders")}>
            {isCoinPurchase ? "View Wallet" : "View Orders"}
          </Button>
          {status !== "success" && (
            <Button variant="outline" onClick={() => navigate(isCoinPurchase ? "/coin-store" : "/checkout")}>Try Again</Button>
          )}
          <Button variant="ghost" onClick={() => navigate("/")}>Home</Button>
        </div>
      </div>
    </main>
  );
}