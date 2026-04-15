import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { Package, Truck, MapPin, Weight, ExternalLink, RefreshCw, FileText, ShoppingCart, CheckCircle2, CreditCard, BookOpen, Headphones, BookCopy } from "lucide-react";
import { OrderProfitBreakdown } from "@/components/admin/OrderProfitBreakdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminLogger } from "@/hooks/useAdminLogger";
import { AdminUserProfileModal } from "@/components/admin/AdminUserProfileModal";
import { OrderInvoice } from "@/components/admin/OrderInvoice";

// ─── Status Configs ───

const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
  awaiting_payment: { label: "Awaiting", color: "bg-orange-500/20 text-orange-400" },
  paid: { label: "Paid", color: "bg-emerald-500/20 text-emerald-400" },
  failed: { label: "Failed", color: "bg-red-500/20 text-red-400" },
  cancelled: { label: "Cancelled", color: "bg-red-500/20 text-red-400" },
  refunded: { label: "Refunded", color: "bg-blue-500/20 text-blue-400" },
  partial_refunded: { label: "Partial Refund", color: "bg-blue-500/20 text-blue-400" },
};

const digitalOrderStatuses: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  access_granted: "Access Granted",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const hardcopyOrderStatuses: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  ready_for_pickup: "Ready for Pickup",
  pickup_received: "Pickup Received",
  in_transit: "In Transit",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};

const allOrderStatusLabels: Record<string, string> = {
  ...hardcopyOrderStatuses,
  ...digitalOrderStatuses,
  paid: "Paid",
  payment_failed: "Payment Failed",
  awaiting_payment: "Awaiting Payment",
};

const orderStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  access_granted: "bg-emerald-500/20 text-emerald-400",
  processing: "bg-cyan-500/20 text-cyan-400",
  ready_for_pickup: "bg-indigo-500/20 text-indigo-400",
  pickup_received: "bg-violet-500/20 text-violet-400",
  in_transit: "bg-purple-500/20 text-purple-400",
  shipped: "bg-purple-500/20 text-purple-400",
  delivered: "bg-green-500/20 text-green-400",
  cancelled: "bg-red-500/20 text-red-400",
  returned: "bg-orange-500/20 text-orange-400",
  refunded: "bg-blue-500/20 text-blue-400",
  paid: "bg-emerald-500/20 text-emerald-400",
  payment_failed: "bg-red-500/20 text-red-400",
  awaiting_payment: "bg-orange-500/20 text-orange-400",
};

const codPaymentStatusColors: Record<string, string> = {
  not_applicable: "bg-muted text-muted-foreground",
  unpaid: "bg-red-500/20 text-red-400",
  cod_pending_collection: "bg-amber-500/20 text-amber-400",
  collected_by_courier: "bg-blue-500/20 text-blue-400",
  settled_to_merchant: "bg-emerald-500/20 text-emerald-400",
  paid: "bg-green-500/20 text-green-400",
};

const codPaymentStatusLabels: Record<string, string> = {
  not_applicable: "N/A",
  unpaid: "Unpaid",
  cod_pending_collection: "COD Pending",
  collected_by_courier: "Collected by Courier",
  settled_to_merchant: "Settled",
  paid: "Paid",
};

const shipmentStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  created: "bg-blue-500/20 text-blue-400",
  picked_up: "bg-indigo-500/20 text-indigo-400",
  in_transit: "bg-purple-500/20 text-purple-400",
  delivered: "bg-green-500/20 text-green-400",
  cancelled: "bg-red-500/20 text-red-400",
  returned: "bg-orange-500/20 text-orange-400",
};

// ─── Helpers ───

type OrderFormat = "digital" | "hardcopy" | "mixed";

function getOrderFormat(orderItems: any[]): OrderFormat {
  if (!orderItems?.length) return "digital";
  const hasHardcopy = orderItems.some((i: any) => i.format === "hardcopy");
  const hasDigital = orderItems.some((i: any) => i.format === "ebook" || i.format === "audiobook");
  if (hasHardcopy && hasDigital) return "mixed";
  if (hasHardcopy) return "hardcopy";
  return "digital";
}

function getFormatIcon(format: OrderFormat) {
  if (format === "hardcopy") return <BookCopy className="w-3 h-3" />;
  if (format === "mixed") return <Package className="w-3 h-3" />;
  return <BookOpen className="w-3 h-3" />;
}

function getFormatLabel(format: OrderFormat) {
  if (format === "hardcopy") return "Hardcopy";
  if (format === "mixed") return "Mixed";
  return "Digital";
}

function getStatusOptionsForFormat(format: OrderFormat): Record<string, string> {
  if (format === "digital") return digitalOrderStatuses;
  if (format === "hardcopy") return hardcopyOrderStatuses;
  // Mixed: union of both
  return { ...digitalOrderStatuses, ...hardcopyOrderStatuses };
}

// ─── Component ───

export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, any[]>>({});
  const [paymentsMap, setPaymentsMap] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [shipment, setShipment] = useState<any>(null);
  const [shipmentEvents, setShipmentEvents] = useState<any[]>([]);
  const [creatingParcel, setCreatingParcel] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [purchaseCost, setPurchaseCost] = useState<string>("");
  const [orderPackagingCost, setOrderPackagingCost] = useState<string>("");
  const [markingPurchased, setMarkingPurchased] = useState(false);
  const { log, logOrderStatusChange } = useAdminLogger();

  const load = async () => {
    const [ordersRes, itemsRes, paymentsRes] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("order_items").select("order_id, format").limit(5000),
      supabase.from("payments").select("order_id, status, method, transaction_id").limit(5000),
    ]);

    const rawOrders = ordersRes.data || [];

    // Fetch profile fallbacks for orders missing shipping_name
    const missingIds = [...new Set(rawOrders.filter(o => !o.shipping_name && o.user_id).map(o => o.user_id))];
    let profileMap: Record<string, { display_name: string | null; phone: string | null }> = {};
    if (missingIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, phone")
        .in("user_id", missingIds);
      (profiles || []).forEach(p => { profileMap[p.user_id] = p; });
    }

    setOrders(rawOrders.map(o => ({
      ...o,
      _customerName: o.shipping_name || profileMap[o.user_id]?.display_name || o.user_id?.slice(0, 8) || "Unknown",
      _customerPhone: o.shipping_phone || profileMap[o.user_id]?.phone || null,
    })));

    // Build items map: orderId -> items[]
    const iMap: Record<string, any[]> = {};
    (itemsRes.data || []).forEach((item: any) => {
      if (!iMap[item.order_id]) iMap[item.order_id] = [];
      iMap[item.order_id].push(item);
    });
    setOrderItemsMap(iMap);

    // Build payments map: orderId -> latest payment
    const pMap: Record<string, any> = {};
    (paymentsRes.data || []).forEach((p: any) => {
      pMap[p.order_id] = p;
    });
    setPaymentsMap(pMap);
  };

  useEffect(() => { load(); }, []);

  const updateOrderStatus = async (id: string, newStatus: string) => {
    const order = orders.find(o => o.id === id);
    const oldStatus = order?.status || "unknown";
    if (oldStatus === newStatus) return;

    toast.loading("Updating order...", { id: "order-update" });
    try {
      const { data, error } = await supabase.functions.invoke("admin-update-order-status", {
        body: { order_id: id, new_status: newStatus },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.dismiss("order-update");
      const details = [];
      if (data?.content_unlocked > 0) details.push(`${data.content_unlocked} items unlocked`);
      if (data?.earnings?.earnings_created > 0) details.push(`${data.earnings.earnings_created} earnings created`);
      if (data?.skipped) {
        toast.info("No change — status already set");
      } else {
        toast.success(`Order → ${allOrderStatusLabels[newStatus] || newStatus}${details.length ? ` (${details.join(", ")})` : ""}`);
      }
      await logOrderStatusChange(id, order?.order_number, oldStatus, newStatus);
    } catch (err: any) {
      toast.dismiss("order-update");
      toast.error(err?.message || "Failed to update order status");
    }
    load();
  };

  const viewDetail = async (order: any) => {
    setDetail(order);
    setShipment(null);
    setShipmentEvents([]);
    setStatusHistory([]);
    setPurchaseCost(order.purchase_cost_per_unit ?? "");
    setOrderPackagingCost(order.packaging_cost ?? "");
    const [itemsRes, shipRes, historyRes] = await Promise.all([
      supabase.from("order_items").select("*, books(title, cover_url)").eq("order_id", order.id),
      supabase.from("shipments").select("*").eq("order_id", order.id).maybeSingle(),
      supabase.from("order_status_history").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    ]);
    setItems(itemsRes.data || []);
    setStatusHistory(historyRes.data || []);

    const hardcopyItems = (itemsRes.data || []).filter((i: any) => i.format === "hardcopy");
    if (hardcopyItems.length > 0) {
      const bookIds = [...new Set(hardcopyItems.map((i: any) => i.book_id))];
      const { data: fmts } = await supabase.from("book_formats").select("book_id, unit_cost, default_packaging_cost").in("book_id", bookIds).eq("format", "hardcopy");
      if (fmts?.length) {
        // Auto-fill purchase cost if not already set on order
        if (!order.purchase_cost_per_unit) {
          const uc = fmts[0]?.unit_cost;
          if (uc) setPurchaseCost(String(uc));
        }
        // Auto-fill packaging cost if not already set on order
        if (!order.packaging_cost) {
          const pkg = fmts[0]?.default_packaging_cost;
          setOrderPackagingCost(String(pkg && Number(pkg) > 0 ? pkg : 10));
        }
      }
    }

    if (shipRes.data) {
      setShipment(shipRes.data);
      const { data: events } = await supabase.from("shipment_events").select("*").eq("shipment_id", (shipRes.data as any).id).order("event_time", { ascending: false });
      setShipmentEvents(events || []);
    }
  };

  const createParcel = async (orderId: string) => {
    setCreatingParcel(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-parcel", { body: { order_id: orderId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Parcel created successfully!");
      if (detail) viewDetail(detail);
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create parcel");
    } finally { setCreatingParcel(false); }
  };

  const trackParcel = async (shipmentId: string) => {
    setTrackingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("track-parcel", { body: { shipment_id: shipmentId } });
      if (error) throw error;
      if (data?.shipment) setShipment(data.shipment);
      if (data?.events) setShipmentEvents(data.events);
      toast.success("Tracking updated");
    } catch (err: any) {
      toast.error(err?.message || "Tracking failed");
    } finally { setTrackingLoading(false); }
  };

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !(o._customerName || "").toLowerCase().includes(q) &&
        !o.id.toLowerCase().includes(q) &&
        !(o.order_number || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const hasHardcopyItems = (o: any) => {
    const oi = orderItemsMap[o.id];
    if (oi) return oi.some((i: any) => i.format === "hardcopy");
    return o.shipping_name || o.total_weight > 0;
  };

  // Get detail format
  const detailFormat = useMemo(() => getOrderFormat(items), [items]);
  const detailPayment = detail ? paymentsMap[detail.id] : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-black">Orders</h1>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search by order number, name, or ID..." className="flex-1 min-w-[200px] max-w-sm" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(allOrderStatusLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="shadow-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-white">Order #</TableHead>
              <TableHead className="text-white">Customer</TableHead>
              <TableHead className="text-white">Type</TableHead>
              <TableHead className="text-white">Amount</TableHead>
              <TableHead className="text-white">Payment Status</TableHead>
              <TableHead className="text-white">Order Status</TableHead>
              <TableHead className="text-white">Update Order</TableHead>
              <TableHead className="text-right text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const oFormat = getOrderFormat(orderItemsMap[o.id] || []);
              const payment = paymentsMap[o.id];
              const payStatus = payment?.status || (o.payment_method === "demo" ? "paid" : "pending");
              const pConfig = paymentStatusConfig[payStatus] || paymentStatusConfig.pending;
              const statusOptions = getStatusOptionsForFormat(oFormat);

              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <div>
                      <p className="text-xs font-mono font-medium text-black">{o.order_number || o.id.slice(0, 8).toUpperCase()}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <button
                        className="text-sm font-medium text-black  cursor-pointer text-left"
                        onClick={() => o.user_id && setProfileUserId(o.user_id)}
                        disabled={!o.user_id}
                      >
                        {o._customerName}
                      </button>
                      {o.shipping_district && <p className="text-xs text-black">{o.shipping_district}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1 text-[10px] text-black">
                      {getFormatIcon(oFormat)} {getFormatLabel(oFormat)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">৳{o.total_amount}</TableCell>
                  {/* Payment Status */}
                  <TableCell>
                    <Badge className={`${pConfig.color} text-black`}>
                      <CreditCard className="w-3 h-3 mr-1" />
                      {pConfig.label}
                    </Badge>
                    {o.payment_method === "cod" && o.cod_payment_status && o.cod_payment_status !== "not_applicable" && (
                      <Badge className={`ml-1 ${codPaymentStatusColors[o.cod_payment_status] || ""} `}>
                        {codPaymentStatusLabels[o.cod_payment_status] || o.cod_payment_status}
                      </Badge>
                    )}
                  </TableCell>
                  {/* Order Status */}
                  <TableCell>
                    <Badge className={orderStatusColors[o.status] || "bg-muted"}>
                      {allOrderStatusLabels[o.status] || o.status}
                    </Badge>
                  </TableCell>
                  {/* Update Dropdown (format-aware) */}
                  <TableCell className="text-white">
                    <Select value={o.status} onValueChange={(v) => updateOrderStatus(o.id, v)}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusOptions).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => viewDetail(o)}>View</Button>
                      {hasHardcopyItems(o) && o.status === "confirmed" && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => createParcel(o.id)} disabled={creatingParcel}>
                          <Package className="w-3 h-3" /> Ship
                        </Button>
                      )}
                      {o.payment_method === "cod" && payStatus !== "paid" && ["delivered", "completed"].includes(o.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                          onClick={async () => {
                            toast.loading("Marking as paid...", { id: "cod-pay" });
                            const { error } = await supabase.from("payments").update({ status: "paid", transaction_id: "COD-MANUAL-" + o.id.slice(0, 8).toUpperCase() }).eq("order_id", o.id).eq("method", "cod");
                            if (error) { toast.dismiss("cod-pay"); toast.error(error.message); return; }
                            await supabase.from("orders").update({ cod_payment_status: "settled_to_merchant" }).eq("id", o.id);
                            await supabase.from("payment_events").insert({ order_id: o.id, event_type: "cod_manual_settle", status: "paid", metadata: { settled_by: "admin_manual" } });
                            await log({ module: "orders", action: `COD payment manually marked as paid`, actionType: "payment_settle", targetType: "order", targetId: o.id, details: `Order ${o.order_number || o.id.slice(0, 8)} COD payment settled manually`, riskLevel: "high" });
                            toast.dismiss("cod-pay");
                            toast.success("COD payment marked as Paid ✅");
                            load();
                          }}
                        >
                          <CreditCard className="w-3 h-3" /> Mark Paid
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!orders.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No orders</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Order Details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              {/* Format Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 text-black">
                  {getFormatIcon(detailFormat)} {getFormatLabel(detailFormat)} Order
                </Badge>
                {detail.payment_method === "demo" && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">🧪 Demo</Badge>
                )}
              </div>

              {/* Customer & Address */}
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Name:</span> {detail._customerName || detail.shipping_name || "—"}</div>
                <div><span className="text-muted-foreground">Phone:</span> {detail._customerPhone || detail.shipping_phone || "—"}</div>
                {detail.shipping_district && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">District:</span> {detail.shipping_district}
                  </div>
                )}
                {detail.shipping_area && <div><span className="text-muted-foreground">Area:</span> {detail.shipping_area}</div>}
                <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {detail.shipping_address || "—"}</div>
              </div>

              {/* Weight & Shipping (hardcopy only) */}
              {detailFormat !== "digital" && (detail.total_weight > 0 || detail.shipping_cost > 0) && (
                <div className="border-t pt-3 grid grid-cols-3 gap-2">
                  {detail.total_weight > 0 && (
                    <div className="flex items-center gap-1">
                      <Weight className="w-3 h-3 text-muted-foreground" />
                      <span>{detail.total_weight} kg</span>
                    </div>
                  )}
                  {detail.shipping_method_name && <div><span className="text-muted-foreground">Method:</span> {detail.shipping_method_name}</div>}
                  {detail.shipping_cost > 0 && <div><span className="text-muted-foreground">Customer Delivery:</span> ৳{detail.shipping_cost}</div>}
                </div>
              )}

              {/* Payment Status & Order Status — SEPARATED */}
              <div className="border-t pt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">Payment Status</p>
                  {detail.payment_method === "cod" ? (
                    <div className="space-y-2">
                      <Badge className="bg-amber-500/20 text-amber-400">COD</Badge>
                      <div className="flex items-center gap-2">
                        <Badge className={codPaymentStatusColors[detail.cod_payment_status] || "bg-muted text-muted-foreground"}>
                          {codPaymentStatusLabels[detail.cod_payment_status] || detail.cod_payment_status || "N/A"}
                        </Badge>
                        <Select
                          value={detail.cod_payment_status || "unpaid"}
                          onValueChange={async (v) => {
                            const oldCod = detail.cod_payment_status || "unpaid";
                            const { error } = await supabase.from("orders").update({ cod_payment_status: v }).eq("id", detail.id);
                            if (error) { toast.error(error.message); return; }
                            toast.success(`COD Payment → ${codPaymentStatusLabels[v] || v}`);
                            await log({
                              module: "orders",
                              action: `COD status: ${oldCod} → ${v}`,
                              actionType: "status_change",
                              targetType: "order",
                              targetId: detail.id,
                              details: `Order ${detail.order_number || detail.id.slice(0, 8)} COD payment status changed`,
                              oldValue: { cod_payment_status: oldCod },
                              newValue: { cod_payment_status: v },
                              riskLevel: v === "settled_to_merchant" || v === "paid" ? "high" : "medium",
                            });
                            setDetail({ ...detail, cod_payment_status: v });
                            load();
                          }}
                        >
                          <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["unpaid", "cod_pending_collection", "collected_by_courier", "settled_to_merchant", "paid"].map((s) => (
                              <SelectItem key={s} value={s}>{codPaymentStatusLabels[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <Badge className={paymentStatusConfig[detailPayment?.status || "paid"]?.color || "bg-emerald-500/20 text-emerald-400"}>
                      <CreditCard className="w-3 h-3 mr-1" />
                      {paymentStatusConfig[detailPayment?.status || "paid"]?.label || "Paid"}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">Order Status</p>
                  <div className="flex items-center gap-2">
                    <Badge className={orderStatusColors[detail.status] || "bg-muted text-muted-foreground"}>
                      {allOrderStatusLabels[detail.status] || detail.status}
                    </Badge>
                    <Select
                      value={detail.status}
                      onValueChange={async (v) => {
                        await updateOrderStatus(detail.id, v);
                        setDetail({ ...detail, status: v });
                      }}
                    >
                      <SelectTrigger className="w-40 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(getStatusOptionsForFormat(detailFormat)).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Payment Method</p>
                  <span className="text-sm font-medium capitalize">{detail.payment_method || "online"}</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Packaging Cost</p>
                  <span className="text-sm font-medium">৳{detail.packaging_cost || 0}</span>
                </div>
              </div>

              {/* Order Items */}
              <div className="border-t pt-3">
                {items.map((i) => (
                  <div key={i.id} className="flex justify-between py-1 items-center">
                    <span className="flex items-center gap-1.5">
                      {i.format === "ebook" && <BookOpen className="w-3 h-3 text-blue-400" />}
                      {i.format === "audiobook" && <Headphones className="w-3 h-3 text-purple-400" />}
                      {i.format === "hardcopy" && <BookCopy className="w-3 h-3 text-orange-400" />}
                      {i.books?.title || "Book"} <Badge variant="outline" className="text-[10px] ml-1">{i.format}</Badge> × {i.quantity}
                    </span>
                    <span>৳{i.unit_price * (i.quantity || 1)}</span>
                  </div>
                ))}
                <div className="border-t mt-2 pt-2 font-bold flex justify-between"><span>Total</span><span>৳{detail.total_amount}</span></div>
              </div>

              {/* Generate Invoice Button */}
              <div className="border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setInvoiceOrder(detail);
                    setInvoiceItems(items);
                  }}
                >
                  <FileText className="w-4 h-4" /> Generate Invoice
                </Button>
              </div>

              {/* Purchase & Cost Info (Hardcopy only) */}
              {items.some((i: any) => i.format === "hardcopy") && (
                <div className="border-t pt-3 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                    Purchase & Cost Info
                    {detail.is_purchased && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" /> Purchased
                      </Badge>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Purchase Cost per Unit (৳)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={purchaseCost}
                        onChange={(e) => setPurchaseCost(e.target.value)}
                        placeholder="Auto-filled from book format"
                        className="h-8 text-sm"
                        disabled={detail.is_purchased || ['delivered', 'paid', 'completed'].includes(detail.status)}
                      />
                      {!detail.is_purchased && !purchaseCost && (
                        <p className="text-[10px] text-amber-500 mt-0.5">No default purchase cost set — enter manually</p>
                      )}
                      {!detail.is_purchased && !!purchaseCost && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Auto-filled · editable before purchase</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Packaging Cost (৳)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={orderPackagingCost}
                        onChange={(e) => setOrderPackagingCost(e.target.value)}
                        placeholder="Default: ৳10"
                        className="h-8 text-sm"
                        disabled={detail.is_purchased || ['delivered', 'paid', 'completed'].includes(detail.status)}
                      />
                      {(detail.is_purchased || ['delivered', 'paid', 'completed'].includes(detail.status)) ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5">🔒 Locked — order finalized</p>
                      ) : !orderPackagingCost ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Default ৳10 · editable before delivery</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Auto-filled · editable before delivery</p>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const uc = Number(purchaseCost) || 0;
                    const pkg = Number(orderPackagingCost) || 0;
                    const totalQty = items.filter((i: any) => i.format === "hardcopy").reduce((s: number, i: any) => s + (i.quantity || 1), 0);
                    const totalSelling = items.filter((i: any) => i.format === "hardcopy").reduce((s: number, i: any) => s + i.unit_price * (i.quantity || 1), 0);
                    const estimatedProfit = totalSelling - (uc * totalQty) - pkg;
                    if (uc <= 0) return null;
                    return (
                      <div className="p-2 rounded-md bg-muted/50 text-xs space-y-1">
                        <p className="font-medium">{detail.is_purchased ? "✅ Final Profit" : "📊 Estimated Profit"}</p>
                        <p>Selling: ৳{totalSelling} − Cost: ৳{uc * totalQty} − Packaging: ৳{pkg} = <span className={estimatedProfit < 0 ? "text-destructive font-bold" : "text-emerald-500 font-bold"}>৳{estimatedProfit.toFixed(0)}</span></p>
                      </div>
                    );
                  })()}

                  {!detail.is_purchased && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={markingPurchased || !(Number(purchaseCost) > 0)}
                      onClick={async () => {
                        setMarkingPurchased(true);
                        const uc = Number(purchaseCost) || 0;
                        const pkg = Number(orderPackagingCost) || 0;
                        const totalQty = items.filter((i: any) => i.format === "hardcopy").reduce((s: number, i: any) => s + (i.quantity || 1), 0);

                        const { error } = await supabase.from("orders").update({
                          purchase_cost_per_unit: uc,
                          packaging_cost: pkg,
                          is_purchased: true,
                        } as any).eq("id", detail.id);

                        if (error) { toast.error(error.message); setMarkingPurchased(false); return; }

                        const bookTitles = items.filter((i: any) => i.format === "hardcopy").map((i: any) => i.books?.title || "Book").join(", ");
                        await supabase.from("accounting_ledger" as any).insert({
                          type: "expense",
                          category: "cost_of_goods_sold",
                          description: `Order-based purchase: ${bookTitles} — ${totalQty} × ৳${uc} (Order #${detail.order_number || detail.id.slice(0, 8)})`,
                          amount: uc * totalQty,
                          entry_date: new Date().toISOString().split("T")[0],
                          order_id: detail.id,
                          reference_type: "order",
                          reference_id: detail.id,
                        } as any);

                        await log({
                          module: "orders",
                          action: `Marked order as purchased: ${totalQty} × ৳${uc}`,
                          actionType: "update",
                          targetType: "order",
                          targetId: detail.id,
                          details: `COGS: ৳${uc * totalQty}, Packaging: ৳${pkg}`,
                          riskLevel: "medium",
                        });

                        toast.success(`Marked as purchased — ৳${(uc * totalQty).toLocaleString()} COGS recorded`);
                        setDetail({ ...detail, is_purchased: true, purchase_cost_per_unit: uc, packaging_cost: pkg });
                        setMarkingPurchased(false);
                        load();
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {markingPurchased ? "Processing..." : "Mark as Purchased"}
                    </Button>
                  )}
                </div>
              )}

              {/* Order Profit Breakdown */}
              <OrderProfitBreakdown
                items={items}
                shippingCost={detail.shipping_cost || 0}
                packagingCost={detail.packaging_cost || 0}
                fulfillmentCost={detail.fulfillment_cost || 0}
                orderPurchaseCost={detail.is_purchased ? detail.purchase_cost_per_unit : undefined}
                isPurchased={detail.is_purchased}
              />

              {/* Shipment Section (hardcopy only) */}
              {detailFormat !== "digital" && (
                <>
                  {shipment ? (
                    <div className="border-t pt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2"><Truck className="w-4 h-4" /> Shipment</h3>
                        <div className="flex gap-1">
                          {shipment.provider_code === "redx" && shipment.tracking_code && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => trackParcel(shipment.id)} disabled={trackingLoading}>
                              <RefreshCw className={`w-3 h-3 ${trackingLoading ? "animate-spin" : ""}`} /> Track
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-muted-foreground">Status:</span> <Badge className={shipmentStatusColors[shipment.status] || ""}>{shipment.status.replace("_", " ")}</Badge></div>
                        <div>
                          <span className="text-muted-foreground">Mode:</span>{" "}
                          {shipment.provider_code === "redx" && shipment.tracking_code ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400">API (RedX)</Badge>
                          ) : (
                            <Badge className="bg-amber-500/20 text-amber-400">Manual</Badge>
                          )}
                        </div>
                        {(shipment.courier_name || shipment.provider_code) && (
                          <div><span className="text-muted-foreground">Courier:</span> {shipment.courier_name || shipment.provider_code}</div>
                        )}
                        {shipment.tracking_code && (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Tracking:</span>
                            <span className="font-mono text-xs">{shipment.tracking_code}</span>
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </div>
                        )}
                        {shipment.parcel_id && <div><span className="text-muted-foreground">Parcel ID:</span> <span className="font-mono text-xs">{shipment.parcel_id}</span></div>}
                      </div>

                      {/* Manual Courier Info Edit */}
                      <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Update Courier Info</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Courier Name</Label>
                            <Input
                              defaultValue={shipment.courier_name || ""}
                              placeholder="e.g. Sundarban, Pathao"
                              className="h-8 text-sm"
                              id={`courier-name-${shipment.id}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Tracking Number</Label>
                            <Input
                              defaultValue={shipment.tracking_code || ""}
                              placeholder="Enter tracking ID"
                              className="h-8 text-sm font-mono"
                              id={`tracking-code-${shipment.id}`}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Label className="text-xs">Shipment Status</Label>
                            <Select
                              defaultValue={shipment.status}
                              onValueChange={async (newStatus) => {
                                const courierNameEl = document.getElementById(`courier-name-${shipment.id}`) as HTMLInputElement;
                                const trackingEl = document.getElementById(`tracking-code-${shipment.id}`) as HTMLInputElement;
                                const courierName = courierNameEl?.value?.trim() || shipment.courier_name || null;
                                const trackingCode = trackingEl?.value?.trim() || shipment.tracking_code || null;

                                const { error } = await supabase.from("shipments").update({
                                  status: newStatus,
                                  courier_name: courierName,
                                  tracking_code: trackingCode,
                                } as any).eq("id", shipment.id);
                                if (error) { toast.error(error.message); return; }

                                await supabase.from("shipment_events").insert({
                                  shipment_id: shipment.id,
                                  status: newStatus,
                                  message: `Manual update: ${shipment.status} → ${newStatus}`,
                                } as any);

                                const shipToOrder: Record<string, string> = {
                                  picked_up: "pickup_received", in_transit: "in_transit", delivered: "delivered",
                                };
                                if (shipToOrder[newStatus]) {
                                  await supabase.from("orders").update({ status: shipToOrder[newStatus] }).eq("id", detail.id);
                                }

                                await log({
                                  module: "orders",
                                  action: `Shipment status: ${shipment.status} → ${newStatus}`,
                                  actionType: "status_change",
                                  targetType: "shipment",
                                  targetId: shipment.id,
                                  details: `Courier: ${courierName || "N/A"}, Tracking: ${trackingCode || "N/A"}`,
                                  riskLevel: "medium",
                                });

                                toast.success(`Shipment → ${newStatus}`);
                                viewDetail(detail);
                                load();
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["pending", "created", "picked_up", "in_transit", "delivered", "cancelled", "returned"].map((s) => (
                                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={async () => {
                              const courierNameEl = document.getElementById(`courier-name-${shipment.id}`) as HTMLInputElement;
                              const trackingEl = document.getElementById(`tracking-code-${shipment.id}`) as HTMLInputElement;
                              const courierName = courierNameEl?.value?.trim() || null;
                              const trackingCode = trackingEl?.value?.trim() || null;

                              const { error } = await supabase.from("shipments").update({
                                courier_name: courierName,
                                tracking_code: trackingCode,
                              } as any).eq("id", shipment.id);
                              if (error) { toast.error(error.message); return; }
                              toast.success("Courier info saved");
                              viewDetail(detail);
                            }}
                          >
                            Save Info
                          </Button>
                        </div>
                      </div>

                      {/* Timeline */}
                      {shipmentEvents.length > 0 && (
                        <div className="space-y-2 pl-4 border-l-2 border-border">
                          {shipmentEvents.map((ev: any) => (
                            <div key={ev.id} className="relative">
                              <div className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
                              <p className="text-sm font-medium capitalize">{ev.status.replace("_", " ")}</p>
                              {ev.message && <p className="text-xs text-muted-foreground">{ev.message}</p>}
                              <p className="text-[10px] text-muted-foreground">{new Date(ev.event_time).toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : hasHardcopyItems(detail) && ["confirmed", "processing"].includes(detail.status) ? (
                    <div className="border-t pt-3">
                      <Button className="w-full gap-2" onClick={() => createParcel(detail.id)} disabled={creatingParcel}>
                        <Package className="w-4 h-4" /> Create Shipment / Dispatch Parcel
                      </Button>
                    </div>
                  ) : null}
                </>
              )}

              {/* Order Status Timeline */}
              {statusHistory.length > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <h3 className="font-semibold text-sm">Status Timeline</h3>
                  <div className="space-y-2 pl-4 border-l-2 border-border">
                    {statusHistory.map((h: any) => (
                      <div key={h.id} className="relative">
                        <div className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
                        <p className="text-sm font-medium">
                          {h.old_status ? `${h.old_status} → ${h.new_status}` : h.new_status}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          by {h.changed_by_name || "System"} • {new Date(h.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AdminUserProfileModal
        userId={profileUserId}
        open={!!profileUserId}
        onOpenChange={(open) => { if (!open) setProfileUserId(null); }}
      />

      {/* Invoice Dialog */}
      <Dialog open={!!invoiceOrder} onOpenChange={() => { setInvoiceOrder(null); setInvoiceItems([]); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Order Invoice</DialogTitle></DialogHeader>
          {invoiceOrder && <OrderInvoice order={invoiceOrder} items={invoiceItems} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
