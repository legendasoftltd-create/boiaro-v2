import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { User, ShoppingBag, Wallet, CreditCard, Calendar, Phone, MapPin, Crown, Shield, Mail, AlertTriangle } from "lucide-react";

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminUserProfileModal({ userId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [coinTxns, setCoinTxns] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOrders: 0, totalSpend: 0, lastOrderDate: "", avgOrderValue: 0 });

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    loadAll(userId);
  }, [userId, open]);

  const loadAll = async (uid: string) => {
    const [profileRes, rolesRes, walletRes, subRes, ordersRes, paymentsRes, coinRes, earningsRes] = await Promise.all([
      supabase.rpc("admin_get_user_profile", { p_user_id: uid }),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("user_coins").select("balance, total_earned, total_spent").eq("user_id", uid).maybeSingle(),
      supabase.from("user_subscriptions").select("*, subscription_plans(name, price, access_type)").eq("user_id", uid).eq("status", "active").maybeSingle(),
      supabase.from("orders").select("id, order_number, status, total_amount, payment_method, cod_payment_status, created_at, shipping_name, shipping_address, shipping_district, shipping_phone").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("payments").select("id, amount, method, status, transaction_id, created_at, order_id").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("coin_transactions").select("id, amount, type, description, source, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("contributor_earnings").select("id, earned_amount, role, format, status, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
    ]);

    const profileData = profileRes.data as Record<string, any> | null;
    const orderList = ordersRes.data || [];

    // RPC always returns a json object (even if profile row missing)
    if (profileData && typeof profileData === "object" && !Array.isArray(profileData)) {
      if (!profileData.display_name && orderList.length > 0) {
        profileData.display_name = orderList[0].shipping_name || "Unknown User";
        profileData.created_at = profileData.created_at || orderList[0].created_at;
      }
      setProfile(profileData);
    } else if (orderList.length > 0) {
      setProfile({
        user_id: uid,
        display_name: orderList[0].shipping_name || "Unknown User",
        created_at: orderList[0].created_at,
        is_active: true,
      });
    } else {
      setProfile({ user_id: uid, display_name: "Unknown User", is_active: true });
    }

    setRoles((rolesRes.data || []).map((r: any) => r.role));
    setWallet(walletRes.data);
    setSubscription(subRes.data);
    setOrders(orderList);
    setPayments(paymentsRes.data || []);
    setCoinTxns(coinRes.data || []);
    setEarnings(earningsRes.data || []);

    const validOrders = orderList.filter((o: any) => !["cancelled", "returned"].includes(o.status));
    const totalSpend = validOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);

    setStats({
      totalOrders: orderList.length,
      totalSpend,
      lastOrderDate: orderList.length > 0 ? orderList[0].created_at : "",
      avgOrderValue: validOrders.length > 0 ? totalSpend / validOrders.length : 0,
    });

    setLoading(false);
  };

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

  const creatorRoles = roles.filter(r => ["writer", "narrator", "publisher"].includes(r));
  const totalEarnings = earnings.reduce((s, e) => s + Number(e.earned_amount || 0), 0);
  const address = orders[0] ? [orders[0].shipping_address, orders[0].shipping_district].filter(Boolean).join(", ") : null;
  const phone = profile?.phone || (orders[0]?.shipping_phone) || null;
  const isDeleted = !!profile?.deleted_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> Customer Profile
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Profile Header */}
            <div className="flex items-start gap-4">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-xl object-cover border border-border/40" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold font-serif truncate">{profile.full_name || profile.display_name || "User"}</h2>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {roles.map(r => (
                    <Badge key={r} variant="secondary" className="text-[10px] capitalize">{r}</Badge>
                  ))}
                  {!profile.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  {isDeleted && (
                    <Badge variant="destructive" className="text-[10px] flex items-center gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" /> Deleted
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                  {profile.created_at && (
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {fmt(profile.created_at)}</span>
                  )}
                  {profile.email && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {profile.email}</span>
                  )}
                  {phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {phone}</span>}
                  {address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {address}</span>}
                </div>
                {isDeleted && profile.deleted_reason && (
                  <p className="text-xs text-destructive mt-1">Reason: {profile.deleted_reason}</p>
                )}
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-card/60 border-border/30">
                <CardContent className="p-3 text-center">
                  <ShoppingBag className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{stats.totalOrders}</p>
                  <p className="text-[10px] text-muted-foreground">Total Orders</p>
                </CardContent>
              </Card>
              <Card className="bg-card/60 border-border/30">
                <CardContent className="p-3 text-center">
                  <CreditCard className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">৳{stats.totalSpend.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Total Spend</p>
                </CardContent>
              </Card>
              <Card className="bg-card/60 border-border/30">
                <CardContent className="p-3 text-center">
                  <ShoppingBag className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">৳{stats.avgOrderValue.toFixed(0)}</p>
                  <p className="text-[10px] text-muted-foreground">Avg Order Value</p>
                </CardContent>
              </Card>
              <Card className="bg-card/60 border-border/30">
                <CardContent className="p-3 text-center">
                  <Calendar className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-sm font-bold truncate">{stats.lastOrderDate ? fmt(stats.lastOrderDate) : "—"}</p>
                  <p className="text-[10px] text-muted-foreground">Last Order</p>
                </CardContent>
              </Card>
            </div>

            {/* Account Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card className="bg-card/60 border-border/30">
                <CardContent className="p-3 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-bold">{wallet?.balance ?? 0} <span className="text-xs font-normal text-muted-foreground">coins</span></p>
                    <p className="text-[10px] text-muted-foreground">Wallet Balance</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/60 border-border/30">
                <CardContent className="p-3 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-bold truncate">{subscription ? (subscription as any).subscription_plans?.name : "None"}</p>
                    <p className="text-[10px] text-muted-foreground">Subscription</p>
                  </div>
                </CardContent>
              </Card>
              {creatorRoles.length > 0 && totalEarnings > 0 && (
                <Card className="bg-card/60 border-border/30">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-primary">৳{totalEarnings.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">Creator Earnings</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="orders" className="space-y-3">
              <TabsList className="bg-muted/50 w-full justify-start">
                <TabsTrigger value="orders" className="text-xs gap-1"><ShoppingBag className="h-3 w-3" /> Orders ({orders.length})</TabsTrigger>
                <TabsTrigger value="payments" className="text-xs gap-1"><CreditCard className="h-3 w-3" /> Payments ({payments.length})</TabsTrigger>
                <TabsTrigger value="wallet" className="text-xs gap-1"><Wallet className="h-3 w-3" /> Wallet ({coinTxns.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="orders">
                {orders.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-6">No orders</p>
                ) : (
                  <div className="rounded-lg border max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Order #</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Method</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map(o => (
                          <TableRow key={o.id}>
                            <TableCell className="text-xs font-mono">{o.order_number || o.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-xs">{fmt(o.created_at)}</TableCell>
                            <TableCell className="text-xs font-medium">৳{o.total_amount}</TableCell>
                            <TableCell className="text-xs capitalize">{o.payment_method === "cod" ? "COD" : o.payment_method || "Online"}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px] capitalize">{o.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments">
                {payments.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-6">No payments</p>
                ) : (
                  <div className="rounded-lg border max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Method</TableHead>
                          <TableHead className="text-xs">Txn ID</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map(p => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs">{fmt(p.created_at)}</TableCell>
                            <TableCell className="text-xs font-medium">৳{p.amount}</TableCell>
                            <TableCell className="text-xs capitalize">{p.method || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{p.transaction_id ? p.transaction_id.slice(0, 12) : "—"}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px] capitalize">{p.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="wallet">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded bg-muted/50">
                    <p className="text-sm font-bold">{wallet?.balance ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Balance</p>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/50">
                    <p className="text-sm font-bold text-emerald-400">{wallet?.total_earned ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Total Earned</p>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/50">
                    <p className="text-sm font-bold text-red-400">{wallet?.total_spent ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Total Spent</p>
                  </div>
                </div>
                {coinTxns.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-6">No transactions</p>
                ) : (
                  <div className="rounded-lg border max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coinTxns.map(t => (
                          <TableRow key={t.id}>
                            <TableCell className="text-xs">{fmt(t.created_at)}</TableCell>
                            <TableCell className={`text-xs font-medium ${t.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {t.amount > 0 ? "+" : ""}{t.amount}
                            </TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px] capitalize">{t.type}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{t.description || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
