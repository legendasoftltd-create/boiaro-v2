import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Trash2, Star, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function AdminReviews() {
  const utils = trpc.useUtils();
  const { data: reviews = [] } = trpc.admin.listReviews.useQuery({});
  const approveMutation = trpc.admin.approveReview.useMutation({
    onSuccess: () => utils.admin.listReviews.invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const rejectMutation = trpc.admin.rejectReview.useMutation({
    onSuccess: () => utils.admin.listReviews.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const remove = async (id: string) => {
    if (!confirm("Hide this review?")) return;
    await rejectMutation.mutateAsync({ id });
    toast.success("Review hidden");
  };

  const toggleStatus = async (r: any) => {
    const current = r.status || "approved";
    if (current === "approved") {
      await rejectMutation.mutateAsync({ id: r.id });
      toast.success("Review hidden");
      return;
    }
    await approveMutation.mutateAsync({ id: r.id });
    toast.success("Review visible");
  };

  const stats = useMemo(() => {
    const visible = reviews.filter((r: any) => (r.status || "approved") === "approved").length;
    const hidden = reviews.filter((r: any) => (r.status || "approved") !== "approved").length;
    return { visible, hidden };
  }, [reviews]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reviews</h1>
          <p className="text-sm text-muted-foreground">Moderate user reviews</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="outline">{stats.visible} Visible</Badge>
          <Badge variant="outline" className="text-muted-foreground">{stats.hidden} Hidden</Badge>
        </div>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Book</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Comment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r: any) => (
              <TableRow key={r.id} className={((r.status || "approved") !== "approved") ? "opacity-50" : ""}>
                <TableCell className="font-medium">{r.book?.title || "—"}</TableCell>
                <TableCell><div className="flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{r.rating}</div></TableCell>
                <TableCell className="max-w-xs truncate">{r.comment || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={(r.status || "approved") === "approved"} onCheckedChange={() => toggleStatus(r)} />
                    <span className="text-xs text-muted-foreground">
                      {(r.status || "approved") === "approved" ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!reviews.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No reviews</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
