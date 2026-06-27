import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const statusLabel: Record<string, string> = {
  open: "খোলা", in_progress: "প্রক্রিয়াধীন", resolved: "সমাধান হয়েছে", closed: "বন্ধ",
};

export default function SupportTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");

  const { data: ticket, isLoading } = trpc.profiles.getTicketDetail.useQuery(
    { ticketId: id! },
    { enabled: !!id }
  );

  const replyMutation = trpc.profiles.replyToTicket.useMutation({
    onSuccess: () => {
      setMessage("");
      utils.profiles.getTicketDetail.invalidate({ ticketId: id! });
      utils.profiles.myTickets.invalidate();
    },
    onError: (e) => toast({ title: "ত্রুটি", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-12">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/support")}>
          <ArrowLeft className="h-4 w-4 mr-1" />সাপোর্টে ফিরে যান
        </Button>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !ticket ? (
          <p className="text-center text-muted-foreground py-16">টিকেট পাওয়া যায়নি</p>
        ) : (
          <Card className="bg-card/80 border-border/40">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg font-serif">{ticket.subject}</CardTitle>
                <Badge variant="secondary">{statusLabel[ticket.status] || ticket.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{(ticket as any).ticket_number}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-secondary/30 text-sm whitespace-pre-wrap">
                {ticket.description}
              </div>

              <div className="space-y-3">
                {(ticket as any).replies.map((r: any) => (
                  <div
                    key={r.id}
                    className={`p-3 rounded-lg text-sm whitespace-pre-wrap max-w-[85%] ${
                      r.is_staff ? "bg-primary/10 ml-0" : "bg-secondary/30 ml-auto"
                    }`}
                  >
                    <p className="text-[11px] text-muted-foreground mb-1">{r.is_staff ? "সাপোর্ট টিম" : "আপনি"}</p>
                    {r.message}
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-border/30">
                <Textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="আপনার রিপ্লাই লিখুন..."
                />
                <Button
                  className="w-full"
                  disabled={!message.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate({ ticketId: id!, message })}
                >
                  <Send className="h-4 w-4 mr-2" />{replyMutation.isPending ? "পাঠানো হচ্ছে..." : "রিপ্লাই পাঠান"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
