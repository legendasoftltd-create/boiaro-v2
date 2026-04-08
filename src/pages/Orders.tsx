import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Package, Clock, Truck, CheckCircle, ShoppingBag, CreditCard, AlertCircle, FileText, BookOpen, Headphones, BookCopy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { OrderInvoice } from "@/components/admin/OrderInvoice"

// ─── Payment Status Config ───
const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Payment Pending", color: "bg-yellow-500/20 text-yellow-400" },
  awaiting_payment: { label: "Awaiting Payment", color: "bg-orange-500/20 text-orange-400" },
  paid: { label: "Paid", color: "bg-emerald-500/20 text-emerald-400" },
  failed: { label: "Payment Failed", color: "bg-red-500/20 text-red-400" },
  cancelled: { label: "Cancelled", color: "bg-red-500/20 text-red-400" },
  refunded: { label: "Refunded", color: "bg-blue-500/20 text-blue-400" },
}

// ─── Order (Fulfillment) Status Config ───
const orderStatusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "bg-yellow-600 text-white" },
  confirmed: { label: "Confirmed", icon: CheckCircle, color: "bg-blue-600 text-white" },
  access_granted: { label: "Access Granted", icon: CheckCircle, color: "bg-emerald-600 text-white" },
  processing: { label: "Processing", icon: Clock, color: "bg-cyan-600 text-white" },
  ready_for_pickup: { label: "Ready for Pickup", icon: Package, color: "bg-indigo-600 text-white" },
  pickup_received: { label: "Pickup Received", icon: Truck, color: "bg-violet-600 text-white" },
  in_transit: { label: "In Transit", icon: Truck, color: "bg-purple-600 text-white" },
  shipped: { label: "Shipped", icon: Truck, color: "bg-purple-600 text-white" },
  delivered: { label: "Delivered", icon: Package, color: "bg-emerald-600 text-white" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "bg-red-600 text-white" },
  returned: { label: "Returned", icon: AlertCircle, color: "bg-orange-600 text-white" },
  refunded: { label: "Refunded", icon: AlertCircle, color: "bg-blue-600 text-white" },
  paid: { label: "Paid", icon: CheckCircle, color: "bg-emerald-600 text-white" },
  payment_failed: { label: "Payment Failed", icon: AlertCircle, color: "bg-red-600 text-white" },
  awaiting_payment: { label: "Awaiting Payment", icon: Clock, color: "bg-orange-600 text-white" },
}

function isDigitalOrder(orderItems: any[]): boolean {
  if (!orderItems?.length) return true;
  return orderItems.every((i: any) => i.format === "ebook" || i.format === "audiobook");
}

function isHardcopyOrder(orderItems: any[]): boolean {
  if (!orderItems?.length) return false;
  return orderItems.some((i: any) => i.format === "hardcopy");
}

export default function Orders() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [invoiceOrder, setInvoiceOrder] = useState<any>(null)
  const [invoiceItems, setInvoiceItems] = useState<any[]>([])
  const [userEmail, setUserEmail] = useState<string>("")

  useEffect(() => {
    if (authLoading) return
    if (!user) { navigate("/auth"); return }

    const fetchOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, order_items(*, books(title, cover_url)), payments(status, method, amount, transaction_id), shipments(courier_name, provider_code, tracking_code, status)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100)

      setOrders(data || [])
      setLoading(false)
    }
    fetchOrders()

    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
  }, [user, authLoading, navigate])

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  })

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20 container mx-auto px-4 lg:px-8">
        <Button variant="ghost" className="gap-2 mb-6 text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <h1 className="text-2xl lg:text-3xl font-serif font-bold text-foreground mb-8">My Orders</h1>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card border-border animate-pulse"><CardContent className="p-6 h-32" /></Card>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-serif font-bold text-foreground mb-2">No Orders Yet</h2>
            <p className="text-muted-foreground mb-6">Start exploring and order your favorite books!</p>
            <Button onClick={() => navigate("/")}>Browse Books</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const oi = order.order_items || [];
              const digital = isDigitalOrder(oi);
              const hasHardcopy = isHardcopyOrder(oi);
              const status = orderStatusConfig[order.status || "pending"] || orderStatusConfig.pending;
              const StatusIcon = status.icon;
              const payment = order.payments?.[0];
              const payStatus = payment?.status || (order.payment_method === "demo" ? "paid" : "pending");
              const pConfig = paymentStatusConfig[payStatus] || paymentStatusConfig.pending;

              return (
                <Card key={order.id} className="bg-card border-border hover:border-primary/20 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <p className="text-xs font-mono font-semibold text-primary mb-0.5">{order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {/* Payment Status Badge */}
                        <Badge className={`${pConfig.color} gap-1 text-xs`}>
                          <CreditCard className="w-3 h-3" /> {pConfig.label}
                        </Badge>
                        {/* Order / Fulfillment Status Badge */}
                        <Badge className={`${status.color} gap-1 text-xs`}>
                          <StatusIcon className="w-3 h-3" /> {status.label}
                        </Badge>
                      </div>
                    </div>

                    {/* Items preview */}
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                      {oi.map((item: any) => (
                        <div key={item.id} className="flex flex-col items-center gap-0.5 shrink-0">
                          <div className="w-10 h-14 rounded bg-muted overflow-hidden">
                            {item.books?.cover_url && <img src={item.books.cover_url} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <span className="text-[8px] text-muted-foreground flex items-center gap-0.5">
                            {item.format === "ebook" && <BookOpen className="w-2.5 h-2.5" />}
                            {item.format === "audiobook" && <Headphones className="w-2.5 h-2.5" />}
                            {item.format === "hardcopy" && <BookCopy className="w-2.5 h-2.5" />}
                            {item.format}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Courier / Tracking Info (hardcopy only) */}
                    {hasHardcopy && (() => {
                      const ship = order.shipments?.[0]
                      if (!ship) return null
                      const courierLabel = ship.courier_name || ship.provider_code
                      return (
                        <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-3 py-1.5 mb-3">
                          <Truck className="w-3.5 h-3.5 text-primary shrink-0" />
                          {courierLabel && <span className="font-medium capitalize">{courierLabel}</span>}
                          {ship.tracking_code && (
                            <span className="font-mono text-muted-foreground">#{ship.tracking_code}</span>
                          )}
                          {!courierLabel && !ship.tracking_code && (
                            <span className="text-muted-foreground">Shipment created</span>
                          )}
                        </div>
                      )
                    })()}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{oi.length || 0} item{(oi.length || 0) !== 1 ? "s" : ""}</span>
                        {payment?.method && (
                          <span className="capitalize">• {payment.method === "cod" ? "Cash on Delivery" : payment.method === "demo" ? "Demo" : payment.method}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {["confirmed", "processing", "ready_for_pickup", "pickup_received", "in_transit", "shipped", "delivered", "paid", "access_granted"].includes(order.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs h-7"
                            onClick={() => {
                              setInvoiceOrder(order)
                              setInvoiceItems(order.order_items || [])
                            }}
                          >
                            <FileText className="w-3 h-3" /> Invoice
                          </Button>
                        )}
                        <span className="text-lg font-bold text-primary font-serif">৳{order.total_amount}</span>
                      </div>
                    </div>

                    {/* Timeline (hardcopy orders only) */}
                    {hasHardcopy && (() => {
                      const steps = ["pending", "confirmed", "processing", "ready_for_pickup", "pickup_received", "in_transit", "delivered"];
                      const stepLabels = ["Pending", "Confirmed", "Processing", "Ready", "Picked Up", "In Transit", "Delivered"];
                      const currentIdx = steps.indexOf(order.status || "pending");
                      return (
                        <>
                          <div className="mt-4 flex items-center gap-1">
                            {steps.map((s, i) => (
                              <div key={s} className="flex-1">
                                <div className={`h-1.5 rounded-full ${i <= currentIdx ? "bg-primary" : "bg-secondary"}`} />
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between mt-1">
                            {stepLabels.map((l) => (
                              <span key={l} className="text-[8px] text-muted-foreground">{l}</span>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {/* Digital order: simple status */}
                    {digital && !hasHardcopy && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        {order.status === "access_granted" || order.status === "paid" || order.status === "confirmed" ? (
                          <span className="text-emerald-500 font-medium">✓ Content unlocked — ready to read/listen</span>
                        ) : order.status === "cancelled" || order.status === "refunded" ? (
                          <span className="text-destructive font-medium">Order {order.status}</span>
                        ) : (
                          <span>Processing your digital order...</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
      <Footer />

      {/* Invoice Dialog */}
      <Dialog open={!!invoiceOrder} onOpenChange={() => { setInvoiceOrder(null); setInvoiceItems([]); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Order Invoice</DialogTitle></DialogHeader>
          {invoiceOrder && <OrderInvoice order={invoiceOrder} items={invoiceItems} customerEmail={userEmail} />}
        </DialogContent>
      </Dialog>
    </main>
  )
}
