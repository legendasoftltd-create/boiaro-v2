import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, MapPin, Phone, User as UserIcon, CreditCard, Truck, ShoppingBag, Wallet, Banknote, CheckCircle2, AlertCircle, Loader2, Globe, Package, Ticket, Weight, Info, Gift, FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { useCart } from "@/contexts/CartContext"
import { useAuth } from "@/contexts/AuthContext"
import { useShippingCalculator } from "@/hooks/useShippingCalculator"
import { useFreeShipping } from "@/hooks/useFreeShipping"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"
import { z } from "zod"
import { sendTransactionalEmail, getEmailTemplate } from "@/lib/emailService"
import { DISTRICTS, isDhakaArea } from "@/lib/bangladeshDistricts"

const shippingSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  phone: z.string().trim().min(10, "Valid phone number required").max(20),
  district: z.string().trim().min(2, "District is required"),
  area: z.string().trim().min(2, "Area/Thana is required").max(200),
  address: z.string().trim().min(5, "Full address is required").max(300),
  postalCode: z.string().optional(),
})

interface PaymentGateway {
  id: string;
  gateway_key: string;
  label: string;
  is_enabled: boolean;
  config: Record<string, any>;
}

const gatewayIcons: Record<string, typeof Wallet> = {
  cod: Banknote, bkash: Wallet, nagad: Wallet, sslcommerz: Globe, stripe: CreditCard, paypal: Globe, razorpay: CreditCard, demo: FlaskConical,
}

type CheckoutStep = "shipping" | "payment" | "processing" | "success" | "failed"

export default function Checkout() {
  const { items, totalPrice, clearCart, addToCart } = useCart()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ name: "", phone: "", district: "", area: "", address: "", postalCode: "" })
  const [method, setMethod] = useState<string>("")
  const [step, setStep] = useState<CheckoutStep>("shipping")
  const [orderId, setOrderId] = useState<string | null>(null)
  const [gateways, setGateways] = useState<PaymentGateway[]>([])
  const [couponCode, setCouponCode] = useState("")
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponApplied, setCouponApplied] = useState(false)
  const [directLoading, setDirectLoading] = useState(false)
  const [successRedirect, setSuccessRedirect] = useState<{ path: string; label: string } | null>(null)

  const shipping = useShippingCalculator(items)
  const freeShipping = useFreeShipping(totalPrice, shipping.areaType)

  // Sync district to shipping calculator
  useEffect(() => { shipping.setDistrict(form.district); }, [form.district])

  // Auto-load book from query params
  useEffect(() => {
    const bookId = searchParams.get("book_id")
    const format = searchParams.get("format") as "ebook" | "audiobook" | "hardcopy" | null
    if (!bookId || !format) return
    if (items.some(i => i.book.id === bookId && i.format === format)) return
    const loadBook = async () => {
      setDirectLoading(true)
      const SAFE_AUTHORS = "id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id";
      const SAFE_PUBLISHERS = "id, name, name_en, logo_url, description, is_verified, is_featured, is_trending, priority, status, user_id";
      const [bookRes, fmtRes] = await Promise.all([
        supabase.from("books").select(`*, authors(${SAFE_AUTHORS}), publishers(${SAFE_PUBLISHERS}), categories(*)`).eq("id", bookId).maybeSingle(),
        supabase.from("book_formats").select("id, book_id, format, price, original_price, discount, pages, duration, file_size, chapters_count, preview_chapters, preview_percentage, audio_quality, binding, dimensions, weight, delivery_days, in_stock, stock_count, is_available, narrator_id, submission_status, printing_cost, unit_cost, submitted_by, created_at, updated_at").eq("book_id", bookId).eq("format", format).maybeSingle(),
      ])
      if (bookRes.data && fmtRes.data) {
        const price = Number(fmtRes.data.price) || 0
        const book: any = {
          id: bookRes.data.id, title: bookRes.data.title, titleEn: bookRes.data.title_en || "",
          slug: bookRes.data.slug, cover: bookRes.data.cover_url || "",
          description: bookRes.data.description || "", descriptionBn: bookRes.data.description_bn || "",
          rating: bookRes.data.rating || 0, reviewsCount: bookRes.data.reviews_count || 0,
          totalReads: String(bookRes.data.total_reads || 0), publishedDate: bookRes.data.published_date || "",
          language: bookRes.data.language || "bn", tags: bookRes.data.tags || [],
          isFeatured: false, isNew: false, isBestseller: false, isFree: false,
          author: { id: "", name: bookRes.data.authors?.name || "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false },
          publisher: { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false },
          category: { id: "", name: "", nameBn: "", icon: "📚", count: "0", color: "#888" },
          formats: {},
        }
        addToCart(book, format, price, 1)
      }
      setDirectLoading(false)
    }
    loadBook()
  }, [searchParams])

  const isDigitalOnly = items.length > 0 && !shipping.hasHardcopy

  useEffect(() => {
    if (step === "shipping" && isDigitalOnly) setStep("payment")
  }, [isDigitalOnly, items.length])

  useEffect(() => {
    const loadGateways = async () => {
      const { data } = await supabase.rpc("get_enabled_gateways" as any)
      const list = ((data as any[]) || []).map((g: any) => ({ ...g, is_enabled: true }))
      setGateways(list)
      const available = isDigitalOnly ? list.filter((g: any) => g.gateway_key !== "cod") : list
      if (available.length > 0 && !method) setMethod(available[0].gateway_key)
    }
    loadGateways()
  }, [])

  useEffect(() => {
    if (isDigitalOnly && method === "cod") {
      const available = gateways.filter(g => g.gateway_key !== "cod")
      setMethod(available.length > 0 ? available[0].gateway_key : "")
    }
  }, [isDigitalOnly, method, gateways])

  const effectiveShippingCharge = freeShipping.isFreeShipping ? 0 : shipping.shippingCharge
  const grandTotal = totalPrice + effectiveShippingCharge - couponDiscount

  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null)

  const applyCoupon = async () => {
    if (!couponCode.trim() || !user) return
    const { data } = await supabase.from("coupons" as any).select("*").eq("code", couponCode.toUpperCase()).eq("status", "active").single()
    const coupon = data as any
    if (!coupon) { toast.error("Invalid coupon code"); return }
    const now = new Date()
    if (coupon.start_date && new Date(coupon.start_date) > now) { toast.error("Coupon not yet active"); return }
    if (coupon.end_date && new Date(coupon.end_date) < now) { toast.error("Coupon expired"); return }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) { toast.error("Usage limit reached"); return }
    if (coupon.min_order_amount > 0 && totalPrice < coupon.min_order_amount) { toast.error(`Min ৳${coupon.min_order_amount} required`); return }

    // Check applies_to scope against cart
    const hasHardcopy = items.some(i => i.format === "hardcopy")
    const hasEbook = items.some(i => i.format === "ebook")
    const hasAudiobook = items.some(i => i.format === "audiobook")
    if (coupon.applies_to === "hardcopy" && !hasHardcopy) { toast.error("This coupon is for hardcopy orders only"); return }
    if (coupon.applies_to === "ebook" && !hasEbook) { toast.error("This coupon is for ebook orders only"); return }
    if (coupon.applies_to === "audiobook" && !hasAudiobook) { toast.error("This coupon is for audiobook orders only"); return }

    // Check per_user_limit
    if (coupon.per_user_limit && coupon.per_user_limit > 0) {
      const { count } = await supabase.from("coupon_usage" as any).select("id", { count: "exact", head: true }).eq("coupon_id", coupon.id).eq("user_id", user.id)
      if ((count || 0) >= coupon.per_user_limit) { toast.error("You've already used this coupon"); return }
    }

    // Check first_order_only
    if (coupon.first_order_only) {
      const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["confirmed", "paid", "completed", "delivered"])
      if ((count || 0) > 0) { toast.error("This coupon is for first orders only"); return }
    }

    const disc = coupon.discount_type === "percentage"
      ? Math.min(totalPrice, (totalPrice * coupon.discount_value) / 100)
      : Math.min(totalPrice, coupon.discount_value)
    setCouponDiscount(disc)
    setCouponApplied(true)
    setAppliedCouponId(coupon.id)
    toast.success(`Coupon applied! ৳${disc} off`)
  }

  const handleChange = (field: string, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: "" }))
  }

  const proceedToPayment = () => {
    if (shipping.hasHardcopy) {
      const result = shippingSchema.safeParse(form)
      if (!result.success) {
        const fieldErrors: Record<string, string> = {}
        result.error.errors.forEach(e => { fieldErrors[e.path[0] as string] = e.message })
        setErrors(fieldErrors)
        return
      }
      if (!shipping.selectedMethodId) {
        toast.error("Please select a shipping method")
        return
      }
    }
    setStep("payment")
  }

  const handlePlaceOrder = async () => {
    if (!user) { toast.error("Please sign in"); navigate("/auth"); return }
    if (items.length === 0) { toast.error("Cart is empty"); return }

    // Stock availability check for hardcopy items
    const hardcopyCartItems = items.filter(i => i.format === "hardcopy")
    if (hardcopyCartItems.length > 0) {
      const stockCheckPayload = hardcopyCartItems.map(i => ({
        book_id: i.book.id, format: "hardcopy", quantity: i.quantity,
      }))
      const { data: stockResult, error: stockErr } = await supabase.rpc("check_stock", {
        p_items: stockCheckPayload,
      })
      if (stockErr) { toast.error("স্টক যাচাই করতে ব্যর্থ হয়েছে"); return }
      const outOfStock = (stockResult as any[])?.filter((s: any) => !s.in_stock)
      if (outOfStock && outOfStock.length > 0) {
        const names = outOfStock.map((s: any) => {
          const item = items.find(i => i.book.id === s.book_id)
          return `"${item?.book.title || 'Book'}" (স্টক: ${s.available})`
        }).join(", ")
        toast.error(`স্টকে নেই: ${names}`)
        return
      }
    }

    // Duplicate purchase check for digital items
    for (const item of items) {
      if (item.format === "ebook" || item.format === "audiobook") {
        const [purchaseRes, unlockRes] = await Promise.all([
          supabase
            .from("user_purchases" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("book_id", item.book.id)
            .eq("format", item.format)
            .eq("status", "active")
            .maybeSingle(),
          supabase
            .from("content_unlocks")
            .select("id")
            .eq("user_id", user.id)
            .eq("book_id", item.book.id)
            .eq("format", item.format)
            .eq("status", "active")
            .maybeSingle(),
        ])

        if (purchaseRes.data || unlockRes.data) {
          toast.error(`"${item.book.title}" (${item.format}) ইতোমধ্যে আনলক করা হয়েছে`)
          return
        }
      }
    }

    setStep("processing")
    setLoading(true)
    try {
      const orderPayload: any = {
        user_id: user.id,
        total_amount: grandTotal,
        status: "pending",
        payment_method: method,
        coupon_code: couponApplied ? couponCode.toUpperCase() : null,
        discount_amount: couponDiscount,
      }
      // Always store customer identity for admin visibility (digital-only orders skip shipping form)
      if (!shipping.hasHardcopy) {
        orderPayload.shipping_name = profile?.display_name || user.email || "Customer"
        orderPayload.shipping_phone = profile?.phone || null
      }
      if (shipping.hasHardcopy) {
        orderPayload.packaging_cost = 10
      }
      if (shipping.hasHardcopy) {
        orderPayload.shipping_name = form.name
        orderPayload.shipping_phone = form.phone
        orderPayload.shipping_address = form.address
        orderPayload.shipping_city = form.district
        orderPayload.shipping_zip = form.postalCode || null
        orderPayload.shipping_district = form.district
        orderPayload.shipping_area = form.area
        orderPayload.total_weight = shipping.totalWeight
      }
      if (shipping.hasHardcopy && shipping.selectedMethod) {
        orderPayload.shipping_method_id = shipping.selectedMethod.id
        orderPayload.shipping_method_name = shipping.selectedMethod.name
        orderPayload.shipping_carrier = shipping.selectedMethod.provider_code
        orderPayload.shipping_cost = effectiveShippingCharge
        orderPayload.estimated_delivery_days = shipping.selectedMethod.delivery_time
        if (freeShipping.isFreeShipping && freeShipping.campaign) {
          orderPayload.free_shipping_campaign = freeShipping.campaign.name
        }
      }
      const { data: order, error: orderErr } = await supabase.from("orders").insert(orderPayload).select("id").single()
      if (orderErr || !order) throw orderErr || new Error("Failed to create order")

      const orderItems = items.map(item => ({
        order_id: order.id, book_id: item.book.id,
        format: item.format as "ebook" | "audiobook" | "hardcopy",
        quantity: item.quantity, unit_price: item.price,
      }))
      const { error: itemsErr } = await supabase.from("order_items").insert(orderItems)
      if (itemsErr) throw itemsErr

      const isCod = method === "cod"
      const isMobilePayment = method === "bkash" || method === "nagad"
      const isSSLCommerz = method === "sslcommerz"
      const isDemo = method === "demo"
      const paymentStatus = isCod ? "cod_pending" : isDemo ? "paid" : "awaiting_payment"
      const transactionId = isDemo
        ? `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        : !isCod ? `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` : null
      const paymentPayload: any = {
        user_id: user.id, order_id: order.id, amount: grandTotal,
        method: isDemo ? "demo" : method,
        status: paymentStatus, transaction_id: transactionId,
      }
      const { error: payErr } = await supabase.from("payments").insert(paymentPayload)
      if (payErr) console.error("Payment insert failed:", JSON.stringify(payErr))

      if (isDemo) {
        // Demo uses the same unified fulfill-order handler as SSLCommerz
        const { data: fulfillResult, error: fulfillErr } = await supabase.functions.invoke("fulfill-order", {
          body: { order_id: order.id, transaction_id: transactionId, gateway: "demo", paid_amount: grandTotal },
        })
        if (fulfillErr) console.error("Demo fulfill error:", fulfillErr)
        else console.log("Demo fulfill result:", fulfillResult)
      } else if (isSSLCommerz) {
        const { data: sslResult, error: sslErr } = await supabase.functions.invoke("sslcommerz-initiate", { body: { order_id: order.id } })
        if (sslErr || !sslResult?.gateway_url) throw new Error(sslResult?.error || "Failed to initiate SSLCommerz payment")
        window.location.href = sslResult.gateway_url
        return
      } else if (isMobilePayment) {
        await new Promise(r => setTimeout(r, 2000))
        await supabase.from("payments").update({ status: "paid", transaction_id: `${method.toUpperCase()}-${Date.now()}` } as any).eq("order_id", order.id)
        await supabase.from("orders").update({ status: "confirmed" }).eq("id", order.id)
        try { await supabase.functions.invoke("calculate-earnings", { body: { order_id: order.id } }) } catch (e) { console.error("Earnings calculation failed:", e) }
      }

      // Record coupon usage + increment used_count
      if (couponApplied && appliedCouponId) {
        await supabase.from("coupon_usage" as any).insert({ coupon_id: appliedCouponId, user_id: user.id, order_id: order.id, discount_amount: couponDiscount } as any)
        const { data: cpn } = await supabase.from("coupons" as any).select("used_count").eq("id", appliedCouponId).single() as any
        await supabase.from("coupons" as any).update({ used_count: ((cpn?.used_count || 0) + 1) } as any).eq("id", appliedCouponId)
      }

      // Save redirect info before clearing cart
      const firstDigital = items.find(i => i.format === "ebook" || i.format === "audiobook")
      if (firstDigital) {
        const slug = firstDigital.book.slug || firstDigital.book.id
        setSuccessRedirect(firstDigital.format === "ebook"
          ? { path: `/read/${slug}`, label: "📖 Read Now" }
          : { path: `/book/${slug}?tab=audiobook`, label: "🎧 Listen Now" }
        )
      }

      setOrderId(order.id)
      clearCart()
      setStep("success")

      try {
        const template = await getEmailTemplate("order_confirmation")
        if (template) {
          await sendTransactionalEmail({
            recipientEmail: user.email || "", templateType: "order_confirmation", subject: template.subject,
            templateData: { user_name: form.name, order_id: order.id.slice(0, 8), total_amount: String(grandTotal) },
            idempotencyKey: `order-confirm-${order.id}`,
          })
        }
      } catch (e) { console.error("Order email failed:", e) }
    } catch (err: any) {
      setStep("failed")
      toast.error(err?.message || "Payment failed")
    } finally { setLoading(false) }
  }

  // ── Empty / processing / success / failed screens ──
  if (items.length === 0 && step !== "success" && !directLoading && !searchParams.get("book_id")) {
    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 pb-20 text-center container mx-auto px-4">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4"><ShoppingBag className="w-8 h-8 text-muted-foreground" /></div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Your Cart is Empty</h1>
          <p className="text-muted-foreground mb-6">Add some books to your cart to checkout</p>
          <Button onClick={() => navigate("/")}>Browse Books</Button>
        </div>
      </main>
    )
  }
  if (step === "processing") {
    return (
      <main className="min-h-screen bg-background"><Navbar />
        <div className="pt-32 pb-20 text-center container mx-auto px-4">
          <Loader2 className="w-16 h-16 text-primary mx-auto mb-6 animate-spin" />
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Processing Payment</h1>
          <p className="text-muted-foreground">{method === "demo" ? "Demo mode — connecting..." : method === "cod" ? "Creating your order..." : `Connecting to ${method} gateway...`}</p>
        </div>
      </main>
    )
  }
  if (step === "success") {
    return (
      <main className="min-h-screen bg-background"><Navbar />
        <div className="pt-32 pb-20 text-center container mx-auto px-4 max-w-md">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10 text-emerald-400" /></div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Order Placed!</h1>
          {method === "demo" && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 mb-2">🧪 Demo Payment — No real charge</Badge>
          )}
          <p className="text-muted-foreground mb-2">{method === "demo" ? "Demo payment successful! Content access has been unlocked instantly." : method === "cod" ? "Your order has been placed. Pay on delivery." : "Payment confirmed! Your order is being processed."}</p>
          {orderId && <p className="text-xs text-muted-foreground mb-6">Order ID: <span className="font-mono text-foreground">{orderId.slice(0, 8).toUpperCase()}</span></p>}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {successRedirect && (
              <Button className="gap-2" onClick={() => navigate(successRedirect.path)}>
                {successRedirect.label}
              </Button>
            )}
            <Button variant={successRedirect ? "outline" : "default"} onClick={() => navigate("/orders")}>View Orders</Button>
            <Button variant="ghost" onClick={() => navigate("/")}>Continue Browsing</Button>
          </div>
        </div>
      </main>
    )
  }
  if (step === "failed") {
    return (
      <main className="min-h-screen bg-background"><Navbar />
        <div className="pt-32 pb-20 text-center container mx-auto px-4 max-w-md">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6"><AlertCircle className="w-10 h-10 text-destructive" /></div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Payment Failed</h1>
          <p className="text-muted-foreground mb-6">Something went wrong. Please try again.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => setStep("payment")}>Try Again</Button>
            <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
          </div>
        </div>
      </main>
    )
  }

  const selectedGw = gateways.find(g => g.gateway_key === method)

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20 container mx-auto px-4 lg:px-8">
        <Button variant="ghost" className="gap-2 mb-6 text-muted-foreground" onClick={() => {
          if (step === "payment" && shipping.hasHardcopy) setStep("shipping")
          else navigate(-1)
        }}>
          <ArrowLeft className="w-4 h-4" /> {step === "payment" && shipping.hasHardcopy ? "Back to Shipping" : "Back"}
        </Button>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8 max-w-md">
          {(isDigitalOnly ? ["Payment", "Confirm"] : ["Shipping", "Payment", "Confirm"]).map((s, i) => {
            const stepIndex = isDigitalOnly ? i + 1 : i
            const isActive = (stepIndex === 0 && step === "shipping") || (stepIndex === 1 && step === "payment")
            const isDone = (stepIndex === 0 && step === "payment")
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-primary/30 text-primary" : "bg-secondary text-muted-foreground"}`}>{i + 1}</div>
                <span className="text-xs text-muted-foreground hidden sm:inline">{s}</span>
                {i < (isDigitalOnly ? 1 : 2) && <div className="flex-1 h-0.5 bg-border" />}
              </div>
            )
          })}
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            {step === "shipping" && (
              <>
                {/* Address Form */}
                <Card className="bg-card border-border">
                  <CardContent className="p-6 space-y-5">
                    <h2 className="text-lg font-serif font-semibold text-foreground flex items-center gap-2">
                      <Truck className="w-5 h-5 text-primary" /> ডেলিভারি তথ্য
                    </h2>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm flex items-center gap-1.5 mb-1.5"><UserIcon className="w-3.5 h-3.5" /> প্রাপকের নাম</Label>
                          <Input placeholder="আপনার নাম" value={form.name} onChange={e => handleChange("name", e.target.value)} className="bg-secondary border-border" />
                          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                        </div>
                        <div>
                          <Label className="text-sm flex items-center gap-1.5 mb-1.5"><Phone className="w-3.5 h-3.5" /> ফোন</Label>
                          <Input placeholder="01XXXXXXXXX" value={form.phone} onChange={e => handleChange("phone", e.target.value)} className="bg-secondary border-border" />
                          {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm flex items-center gap-1.5 mb-1.5"><MapPin className="w-3.5 h-3.5" /> জেলা</Label>
                          <Select value={form.district} onValueChange={v => handleChange("district", v)}>
                            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="জেলা নির্বাচন করুন" /></SelectTrigger>
                            <SelectContent>
                              {DISTRICTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {errors.district && <p className="text-xs text-destructive mt-1">{errors.district}</p>}
                        </div>
                        <div>
                          <Label className="text-sm mb-1.5">এলাকা / থানা</Label>
                          <Input placeholder="মিরপুর, উত্তরা..." value={form.area} onChange={e => handleChange("area", e.target.value)} className="bg-secondary border-border" />
                          {errors.area && <p className="text-xs text-destructive mt-1">{errors.area}</p>}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm flex items-center gap-1.5 mb-1.5"><MapPin className="w-3.5 h-3.5" /> পূর্ণ ঠিকানা</Label>
                        <Input placeholder="বাসা নং, রাস্তা, এলাকা" value={form.address} onChange={e => handleChange("address", e.target.value)} className="bg-secondary border-border" />
                        {errors.address && <p className="text-xs text-destructive mt-1">{errors.address}</p>}
                      </div>
                      <div className="w-1/2">
                        <Label className="text-sm mb-1.5">পোস্ট কোড (ঐচ্ছিক)</Label>
                        <Input placeholder="1205" value={form.postalCode} onChange={e => handleChange("postalCode", e.target.value)} className="bg-secondary border-border" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Area auto-detection badge */}
                {form.district && (
                  <div className="flex items-center gap-2 text-sm">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">ডেলিভারি এরিয়া:</span>
                    <Badge className={isDhakaArea(form.district) ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                      {isDhakaArea(form.district) ? "ঢাকার ভিতরে" : "ঢাকার বাইরে"}
                    </Badge>
                  </div>
                )}

                {/* Free Shipping Banner */}
                {freeShipping.isFreeShipping && shipping.hasHardcopy && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                    <Gift className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">🎉 ফ্রি শিপিং! — {freeShipping.campaign?.name}</span>
                  </div>
                )}

                {/* Shipping Method Selection */}
                {shipping.hasHardcopy && shipping.methods.length > 0 && (
                  <Card className="bg-card border-border">
                    <CardContent className="p-6 space-y-4">
                      <h2 className="text-lg font-serif font-semibold text-foreground flex items-center gap-2">
                        <Package className="w-5 h-5 text-primary" /> শিপিং মেথড
                      </h2>

                      {/* Weight summary */}
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
                        <Weight className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">মোট ওজন:</span>
                        <span className="font-semibold">{shipping.totalWeight.toFixed(2)} kg</span>
                        <span className="text-muted-foreground">({shipping.hardcopyItems.length} টি বই)</span>
                      </div>

                      <div className="space-y-2">
                        {shipping.methods.map(sm => (
                          <button
                            key={sm.id}
                            onClick={() => shipping.setSelectedMethodId(sm.id)}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                              shipping.selectedMethodId === sm.id
                                ? "border-primary bg-primary/5"
                                : "border-border bg-secondary hover:border-primary/30"
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              shipping.selectedMethodId === sm.id ? "bg-primary/20" : "bg-muted"
                            }`}>
                              <Truck className={`w-5 h-5 ${shipping.selectedMethodId === sm.id ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{sm.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {sm.provider_code && `${sm.provider_code} • `}{sm.delivery_time}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-foreground">
                              {freeShipping.isFreeShipping ? <span className="text-emerald-400">ফ্রি</span> : `৳${shipping.shippingCharge}`}
                            </span>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              shipping.selectedMethodId === sm.id ? "border-primary" : "border-muted-foreground/30"
                            }`}>
                              {shipping.selectedMethodId === sm.id && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button className="w-full h-12 font-semibold" onClick={proceedToPayment}>Continue to Payment</Button>
              </>
            )}

            {step === "payment" && (
              <Card className="bg-card border-border">
                <CardContent className="p-6 space-y-5">
                  <h2 className="text-lg font-serif font-semibold text-foreground flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" /> Payment Method
                  </h2>
                  <div className="space-y-3">
                    {gateways.filter(gw => !(isDigitalOnly && gw.gateway_key === "cod")).map(gw => {
                      const Icon = gatewayIcons[gw.gateway_key] || CreditCard
                      const isOnlineNotReady = ["stripe", "paypal", "razorpay"].includes(gw.gateway_key)
                      const isDemo = gw.gateway_key === "demo"
                      return (
                        <button key={gw.gateway_key} onClick={() => setMethod(gw.gateway_key)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${method === gw.gateway_key ? "border-primary bg-primary/5" : "border-border bg-secondary hover:border-primary/30"}`}>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${method === gw.gateway_key ? "bg-primary/20" : "bg-muted"}`}>
                            <Icon className={`w-5 h-5 ${method === gw.gateway_key ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground flex items-center gap-2">
                              {gw.label}
                              {isDemo && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">🧪 Test</Badge>}
                            </p>
                            <p className="text-xs text-muted-foreground">{isDemo ? "No real charge — for testing only" : (gw as any).config?.description || "Online payment"}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${method === gw.gateway_key ? "border-primary" : "border-muted-foreground/30"}`}>
                            {method === gw.gateway_key && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                          </div>
                          {isOnlineNotReady && <Badge variant="outline" className="text-[10px]">Coming</Badge>}
                        </button>
                      )
                    })}
                    {gateways.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No payment methods available</p>}
                  </div>
                  {method === "demo" && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                      <p>🧪 <strong>Demo Mode</strong> — No real payment will be processed. Order will be marked as demo/test.</p>
                    </div>
                  )}
                  {(method === "bkash" || method === "nagad") && (
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
                      <p>You will be redirected to {selectedGw?.label || method} to complete payment.</p>
                    </div>
                  )}
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center gap-2 mb-2"><Ticket className="w-4 h-4 text-primary" /><span className="text-sm font-medium">Coupon Code</span></div>
                    <div className="flex gap-2">
                      <Input placeholder="Enter code" value={couponCode} onChange={e => { setCouponCode(e.target.value); setCouponApplied(false); setCouponDiscount(0); }} className="bg-secondary font-mono uppercase text-sm" />
                      <Button variant="outline" size="sm" onClick={applyCoupon} disabled={!couponCode.trim()}>Apply</Button>
                    </div>
                    {couponApplied && <p className="text-xs text-emerald-400 mt-1.5">✓ ৳{couponDiscount} discount applied</p>}
                  </div>
                  <Button className="w-full h-12 font-semibold gap-2" onClick={handlePlaceOrder} disabled={loading || !method}>
                    {method === "demo" ? `🧪 Demo Pay ৳${grandTotal}` : method === "cod" ? "Place Order (COD)" : `Pay ৳${grandTotal} with ${selectedGw?.label || method}`}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order summary sidebar */}
          <div className="lg:col-span-2">
            <Card className="bg-card border-border sticky top-24">
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-serif font-semibold text-foreground">Order Summary</h2>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {items.map(item => (
                    <div key={`${item.book.id}-${item.format}`} className="flex gap-3">
                      <img src={item.book.cover} alt="" className="w-12 h-16 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.book.title}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{item.format}</Badge>
                          <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-foreground">৳{item.price * item.quantity}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>৳{totalPrice}</span></div>
                  {isDigitalOnly ? (
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery</span><span className="text-primary text-xs font-medium">⚡ Instant Access</span></div>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Shipping ({shipping.totalWeight.toFixed(1)} kg)</span>
                        {freeShipping.isFreeShipping ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1"><Gift className="w-3 h-3" /> ফ্রি</span>
                        ) : (
                          <span className="text-foreground">৳{shipping.shippingCharge}</span>
                        )}
                      </div>
                      {shipping.selectedMethod && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Delivery</span>
                          <span className="text-muted-foreground">{shipping.selectedMethod.delivery_time}</span>
                        </div>
                      )}
                    </>
                  )}
                  {couponApplied && couponDiscount > 0 && (
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Coupon Discount</span><span className="text-emerald-400">-৳{couponDiscount}</span></div>
                  )}
                  {method && method !== "cod" && (
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payment</span><span className="text-foreground capitalize">{selectedGw?.label || method}</span></div>
                  )}
                  <div className="flex justify-between text-base font-bold border-t border-border pt-3">
                    <span>Total</span>
                    <span className="text-primary font-serif text-xl">৳{grandTotal}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <CreditCard className="w-3 h-3" /><span>Secure, encrypted checkout</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}
