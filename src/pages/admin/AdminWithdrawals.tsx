import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wallet, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function AdminWithdrawals() {
  const utils = trpc.useUtils();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [notes, setNotes] = useState("");

  const { data: requests = [] } = trpc.admin.listWithdrawals.useQuery();

  const updateMutation = trpc.admin.processWithdrawal.useMutation({
    onSuccess: (_data, vars) => {
      utils.admin.listWithdrawals.invalidate();
      toast.success(`Request ${vars.status}`);
      setReviewOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = (id: string, status: string) => {
    updateMutation.mutate({ id, status: status as any, adminNotes: notes || undefined });
  };

  const statusBadge = (status: string) => {
    const config: Record<string, string> = {
      pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      approved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      rejected: "bg-destructive/20 text-destructive border-destructive/30",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${config[status] || ""}`}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Wallet className="h-6 w-6 text-emerald-400" /> Withdrawal Requests
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Pending", count: (requests as any[]).filter(r => r.status === "pending").length, icon: Clock, color: "text-yellow-400" },
          { label: "Approved", count: (requests as any[]).filter(r => r.status === "approved").length, icon: CheckCircle2, color: "text-blue-400" },
          { label: "Paid", count: (requests as any[]).filter(r => r.status === "paid").length, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Rejected", count: (requests as any[]).filter(r => r.status === "rejected").length, icon: XCircle, color: "text-destructive" },
        ].map(s => (
          <Card key={s.label} className="bg-card/60 border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div>
                <p className="text-xl font-bold">{s.count}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests as any[]).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.display_name}</TableCell>
                  <TableCell className="font-semibold text-emerald-400">৳{r.amount}</TableCell>
                  <TableCell className="capitalize">{r.method}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{r.account_info || "—"}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => { setSelected(r); setNotes(r.admin_notes || ""); setReviewOpen(true); }}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!(requests as any[]).length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No withdrawal requests yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review Withdrawal</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">User:</span> <span className="font-medium">{selected.display_name}</span></div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold text-emerald-400">৳{selected.amount}</span></div>
                <div><span className="text-muted-foreground">Method:</span> <span className="capitalize">{selected.method}</span></div>
                <div><span className="text-muted-foreground">Account:</span> <span>{selected.account_info || "N/A"}</span></div>
              </div>
              <div>
                <Label>Admin Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes..." rows={3} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => updateStatus(selected.id, "approved")} disabled={updateMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => updateStatus(selected.id, "paid")} disabled={updateMutation.isPending}>
                  <Wallet className="h-4 w-4 mr-1" /> Mark Paid
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => updateStatus(selected.id, "rejected")} disabled={updateMutation.isPending}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
