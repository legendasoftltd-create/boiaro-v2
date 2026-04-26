import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Send, User, Shield, Lock, Paperclip, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function AdminTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const utils = trpc.useUtils();
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["support-ticket", id],
    queryFn: () => utils.admin.getSupportTicketDetail.fetch({ id: id! }),
    enabled: !!id,
  });

  const { data: replies = [] } = useQuery({
    queryKey: ["ticket-replies", id],
    queryFn: () => utils.admin.listSupportTicketReplies.fetch({ ticketId: id! }),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      await utils.admin.updateSupportTicket.fetch({
        id: id!,
        status: updates.status,
        priority: updates.priority,
        assigned_to: updates.assigned_to,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["support-ticket", id] }); toast({ title: "Updated" }); },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      await utils.admin.addSupportTicketReply.fetch({
        ticketId: id!,
        userId: user!.id,
        message: replyText,
        isInternal,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-replies", id] });
      setReplyText("");
      setIsInternal(false);
      toast({ title: "Reply sent" });
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Ticket not found</div>;

  const statusColors: Record<string, string> = {
    open: "bg-blue-500/20 text-blue-400", in_progress: "bg-yellow-500/20 text-yellow-400",
    resolved: "bg-green-500/20 text-green-400", closed: "bg-muted text-muted-foreground",
  };
  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground", medium: "bg-blue-500/20 text-blue-400",
    high: "bg-orange-500/20 text-orange-400", urgent: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/tickets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-xl font-bold font-serif text-primary flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_number}</span>
            {ticket.type === "complaint" && <Badge variant="outline" className="text-orange-400 border-orange-400/30">Complaint</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">{ticket.subject}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Original Message */}
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{ticket.user_name || "User"}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{ticket.message}</p>
              {ticket.attachment_url && (
                <a href={ticket.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Paperclip className="h-3 w-3" />View Attachment
                </a>
              )}
            </CardContent>
          </Card>

          {/* Replies */}
          {replies.map(r => (
            <Card key={r.id} className={`border-border/40 ${r.is_internal ? "bg-yellow-500/5 border-yellow-500/20" : r.is_admin ? "bg-primary/5 border-primary/20" : "bg-card/60"}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {r.is_admin ? <Shield className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium">{r.sender_name || "User"}</span>
                  {r.is_internal && <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-400/30 gap-1"><Lock className="h-3 w-3" />Internal Note</Badge>}
                  <span className="text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{r.message}</p>
              </CardContent>
            </Card>
          ))}

          {/* Reply Box */}
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-4 space-y-3">
              <Textarea rows={4} placeholder="Write a reply..." value={replyText} onChange={e => setReplyText(e.target.value)} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={isInternal} onCheckedChange={setIsInternal} />
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Internal note (admin only)</span>
                </div>
                <Button disabled={!replyText.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate()}>
                  <Send className="h-4 w-4 mr-2" />{replyMutation.isPending ? "Sending..." : isInternal ? "Add Note" : "Send Reply"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{ticket.user_name || "—"}</span></div>
              <div><span className="text-muted-foreground">Email:</span> <span>{ticket.user_email || "—"}</span></div>
              <div><span className="text-muted-foreground">Phone:</span> <span>{ticket.user_phone || "—"}</span></div>
              <Separator className="bg-border/40" />
              <div><span className="text-muted-foreground">Category:</span> <span>{ticket.category}</span></div>
              <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline" className="text-[10px]">{ticket.type === "complaint" ? "Complaint" : "Ticket"}</Badge></div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={ticket.status} onValueChange={v => updateMutation.mutate({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Priority</label>
                <Select value={ticket.priority} onValueChange={v => updateMutation.mutate({ priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Assign</label>
                <Input value={ticket.assigned_to || ""} placeholder="Staff name" onChange={e => updateMutation.mutate({ assigned_to: e.target.value })} />
              </div>
              <div className="pt-2 flex gap-2">
                <Badge className={statusColors[ticket.status]}>{ticket.status}</Badge>
                <Badge className={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
