import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DollarSign, CheckCircle2, Clock, Users, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useAdminLogger } from "@/hooks/useAdminLogger";
import { trpc } from "@/lib/trpc";

export default function AdminEarnings() {
  const utils = trpc.useUtils();
  const [earnings, setEarnings] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [backfillOrderId, setBackfillOrderId] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const { log } = useAdminLogger();

  useEffect(() => { load(); }, []);

  const load = async () => {
    const rows = await utils.admin.listEarnings.fetch({ limit: 500 });
    setEarnings(rows);

    const userIds = [...new Set(rows.map(e => e.user_id).filter(id => id !== "00000000-0000-0000-0000-000000000000"))];
    if (userIds.length > 0) {
      const profs = await utils.admin.listUsers.fetch({ limit: 1000 });
      const map: Record<string, string> = {};
      (profs?.users || []).forEach((u: any) => { map[u.id] = u.profile?.display_name || "Unknown"; });
      setProfiles(map);
    }
  };

  const filtered = earnings.filter(e => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (roleFilter !== "all" && e.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = profiles[e.user_id]?.toLowerCase() || "";
      const book = e.books?.title?.toLowerCase() || "";
      if (!name.includes(q) && !book.includes(q)) return false;
    }
    return true;
  });

  const pendingCount = earnings.filter(e => e.status === "pending").length;
  const totalPending = earnings.filter(e => e.status === "pending").reduce((s, e) => s + Number(e.earned_amount), 0);
  const totalConfirmed = earnings.filter(e => e.status === "confirmed").reduce((s, e) => s + Number(e.earned_amount), 0);
  const platformEarnings = earnings.filter(e => e.role === "platform").reduce((s, e) => s + Number(e.earned_amount), 0);
  const creatorPayouts = earnings.filter(e => e.role !== "platform").reduce((s, e) => s + Number(e.earned_amount), 0);

  const confirmEarnings = async (ids: string[]) => {
    if (!ids.length) return;
    const data = await utils.admin.confirmEarnings.fetch({ earningIds: ids });
    const count = data?.confirmed_count || ids.length;
    await log({ module: "earnings", action: `${count} earnings confirmed`, actionType: "approve", targetType: "earnings", details: `Bulk confirmed ${count} earnings`, riskLevel: "medium" });
    toast.success(`${count} earning(s) confirmed`);
    setSelectedIds([]);
    setConfirmOpen(false);
    load();
  };

  const confirmAllPending = () => {
    const pending = filtered.filter(e => e.status === "pending").map(e => e.id);
    if (!pending.length) { toast.info("No pending earnings to confirm"); return; }
    setSelectedIds(pending);
    setConfirmOpen(true);
  };

  const backfillOrder = async () => {
    const id = backfillOrderId.trim();
    if (!id) { toast.error("Enter an order ID"); return; }
    setBackfilling(true);
    try {
      const result = await utils.admin.calculateOrderEarnings.fetch({ orderId: id });
      toast.success(`Created ${result.created} earning record(s) for order`);
      setBackfillOrderId("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const statusBadge = (status: string) => {
    const config: Record<string, string> = {
      pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      confirmed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      reversed: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${config[status] || ""}`}>{status}</Badge>;
  };

  const roleBadge = (role: string) => {
    const config: Record<string, string> = {
      writer: "bg-primary/20 text-primary border-primary/30",
      publisher: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      narrator: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      platform: "bg-muted text-muted-foreground border-border",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${config[role] || ""}`}>{role}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-emerald-400" /> Contributor Earnings
        </h1>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button onClick={() => setConfirmOpen(true)} className="gap-1">
              <CheckCircle2 className="w-4 h-4" /> Confirm {selectedIds.length} Selected
            </Button>
          )}
          <Button variant="outline" onClick={confirmAllPending} disabled={!pendingCount}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm All Pending ({pendingCount})
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Platform Earnings", value: `৳${platformEarnings.toFixed(0)}`, icon: TrendingUp, color: "text-primary" },
          { label: "Creator Payouts", value: `৳${creatorPayouts.toFixed(0)}`, icon: Users, color: "text-purple-400" },
          { label: "Confirmed", value: `৳${totalConfirmed.toFixed(0)}`, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Pending", value: `৳${totalPending.toFixed(0)}`, icon: Clock, color: "text-yellow-400" },
        ].map(s => (
          <Card key={s.label} className="border-border/30 bg-card/60">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search by creator or book..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
           <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="writer">Writer</SelectItem>
            <SelectItem value="publisher">Publisher</SelectItem>
            <SelectItem value="narrator">Narrator</SelectItem>
            <SelectItem value="platform">Platform</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border/30 bg-card/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && filtered.filter(e => e.status === "pending").every(e => selectedIds.includes(e.id))}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedIds(filtered.filter(e => e.status === "pending").map(e => e.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="rounded"
                  />
                </TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Book</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>%</TableHead>
                <TableHead>Earned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">No earnings records found</TableCell></TableRow>
              ) : filtered.map(e => (
                <TableRow key={e.id} className={selectedIds.includes(e.id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    {e.status === "pending" && (
                      <input type="checkbox" checked={selectedIds.includes(e.id)} onChange={() => toggleSelect(e.id)} className="rounded" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {e.role === "platform" ? "Platform" : profiles[e.user_id] || e.user_id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate text-sm">{e.books?.title || "—"}</TableCell>
                  <TableCell>{roleBadge(e.role)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] capitalize">{e.format}</Badge></TableCell>
                  <TableCell className="text-sm">৳{e.sale_amount}</TableCell>
                  <TableCell className="text-sm">{e.percentage}%</TableCell>
                  <TableCell className="text-sm font-semibold text-emerald-400">৳{e.earned_amount}</TableCell>
                  <TableCell>{statusBadge(e.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {e.status === "pending" && (
                      <Button size="sm" variant="ghost" onClick={() => confirmEarnings([e.id])} className="h-7 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Confirm
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Backfill tool for existing orders */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium flex items-center gap-1"><TrendingUp className="w-4 h-4 text-amber-400" /> Backfill Earnings for Existing Order</p>
          <p className="text-xs text-muted-foreground">For orders placed before automatic commission calculation was enabled, enter the Order ID to generate earnings records.</p>
          <div className="flex gap-2 max-w-md">
            <Input
              placeholder="Order ID (e.g. ORD-1234567-ABCD)"
              value={backfillOrderId}
              onChange={e => setBackfillOrderId(e.target.value)}
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={backfillOrder} disabled={backfilling} className="whitespace-nowrap">
              {backfilling ? "Processing..." : "Calculate Earnings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info note */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground flex items-center gap-1"><Users className="w-4 h-4" /> Earnings Pipeline</p>
          <p>1. Order confirmed / coin unlock → earnings automatically created as <strong>pending</strong></p>
          <p>2. Admin confirms earnings here → status becomes <strong>confirmed</strong></p>
          <p>3. Confirmed earnings are available for creator withdrawal requests</p>
          <p>4. Creator submits withdrawal → admin processes payout via Withdrawals panel</p>
          <p className="mt-1 text-xs">Revenue splits: <strong>eBook</strong> Writer 60% / Publisher 20% / Platform 15% &nbsp;|&nbsp; <strong>Audiobook</strong> Writer 40% / Narrator 30% / Publisher 10% / Platform 15% &nbsp;|&nbsp; <strong>Hardcopy</strong> Writer 40% / Publisher 30% / Platform 10% / Fulfillment 15%</p>
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Earnings</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to confirm <strong>{selectedIds.length}</strong> pending earning(s)?
            This will make them available for creator withdrawal.
          </p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => confirmEarnings(selectedIds)}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
