import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Users, Eye, Mail, Phone, ExternalLink, Calendar, User2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/15 text-green-400 border-green-500/20",
  rejected: "bg-red-500/15 text-red-400 border-red-500/20",
};

const ROLE_COLORS: Record<string, string> = {
  writer: "bg-primary/20 text-primary border-primary/30",
  publisher: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  narrator: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rj: "bg-destructive/20 text-destructive border-destructive/30",
};

export default function AdminRoleApplications() {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [selected, setSelected] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: apps = [], isLoading } = trpc.admin.listRoleApplications.useQuery({ status: filter });
  const approveMutation = trpc.admin.approveRoleApplication.useMutation({
    onSuccess: () => {
      utils.admin.listRoleApplications.invalidate();
      toast.success("Application approved!");
      setSelected(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const rejectMutation = trpc.admin.rejectApplication.useMutation({
    onSuccess: () => {
      utils.admin.listRoleApplications.invalidate();
      toast.success("Application rejected");
      setSelected(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleReject = async () => {
    if (!selected) return;
    await rejectMutation.mutateAsync({ applicationId: selected.id });
  };

  const handleApprove = async () => {
    if (!selected) return;
    await approveMutation.mutateAsync({ applicationId: selected.id });
  };

  const getName = (app: any) => app.display_name || app.full_name || app.profiles?.display_name || "Unknown User";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
        <Users className="w-6 h-6 text-primary" /> Role Applications
      </h1>

      <Tabs value={filter} onValueChange={v => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-border/30 bg-card/60">
        <CardHeader><CardTitle className="text-base">Applications</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
          ) : apps.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No {filter} applications.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(apps as any[]).map((app) => (
                <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/20 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {app.avatar_url ? (
                      <img src={app.avatar_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <User2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{getName(app)}</span>
                        <Badge variant="outline" className={`text-[10px] capitalize ${ROLE_COLORS[app.applied_role] || ""}`}>
                          {app.applied_role}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[app.status] || ""}`}>
                          {app.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(app.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelected(app)} className="h-8 gap-1.5 text-xs ml-2">
                    <Eye className="w-3.5 h-3.5" /> View Details
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application Review</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-6">
              <div className="flex gap-4 items-start">
                {selected.avatar_url ? (
                  <img src={selected.avatar_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center">
                    <User2 className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-bold">{getName(selected)}</h2>
                  <div className="flex gap-2 mt-1.5">
                    <Badge variant="outline" className={`text-xs capitalize ${ROLE_COLORS[selected.applied_role] || ""}`}>
                      {selected.applied_role}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[selected.status] || ""}`}>
                      {selected.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-secondary/30">
                    <Calendar className="w-4 h-4 text-muted-foreground" /> Applied: {new Date(selected.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {selected.message && (
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Application Message</p>
                  <p className="text-sm italic">"{selected.message}"</p>
                </div>
              )}

              {selected.status === "pending" && (
                <div className="flex gap-3 pt-2 border-t border-border/30">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove} disabled={approveMutation.isPending}>
                    <CheckCircle className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive border-destructive/30" onClick={handleReject} disabled={rejectMutation.isPending}>
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
