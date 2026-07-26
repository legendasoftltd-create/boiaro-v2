import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trophy, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const METRIC_LABELS: Record<string, string> = {
  reading_time: "Reading Time", listening_time: "Listening Time", purchases: "Purchases", referrals: "Referrals",
};

export function AdminCompetitionsTab() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: competitions = [], isLoading } = trpc.admin.listCompetitions.useQuery();
  const saveMutation = trpc.admin.upsertCompetition.useMutation({
    onSuccess: () => { utils.admin.listCompetitions.invalidate(); toast({ title: "Competition saved" }); setOpen(false); },
    onError: (e) => toast({ title: "Failed to save", description: e.message }),
  });
  const cancelMutation = trpc.admin.cancelCompetition.useMutation({ onSuccess: () => utils.admin.listCompetitions.invalidate() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", metric: "reading_time", start_at: "", end_at: "",
    prize_coin_top1: "100", prize_coin_top2: "50", prize_coin_top3: "25", prize_description: "",
  });

  const save = () => {
    if (!form.title.trim() || !form.start_at || !form.end_at) {
      toast({ title: "Title, start, and end dates are required" });
      return;
    }
    saveMutation.mutate({
      title: form.title, description: form.description || null, metric: form.metric as any,
      start_at: new Date(form.start_at).toISOString(), end_at: new Date(form.end_at).toISOString(),
      prize_coin_top1: Number(form.prize_coin_top1) || null,
      prize_coin_top2: Number(form.prize_coin_top2) || null,
      prize_coin_top3: Number(form.prize_coin_top3) || null,
      prize_description: form.prize_description || null,
    });
  };

  if (isLoading) return <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 text-[13px]"><Plus className="w-3.5 h-3.5" /> New Competition</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Competition</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-[12px]">Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-[13px]" /></div>
              <div><Label className="text-[12px]">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 text-[13px]" /></div>
              <div><Label className="text-[12px]">Ranking Metric</Label>
                <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRIC_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[12px]">Start</Label><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="h-9 text-[13px]" /></div>
                <div><Label className="text-[12px]">End</Label><Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="h-9 text-[13px]" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-[12px]">🥇 Coins</Label><Input type="number" value={form.prize_coin_top1} onChange={(e) => setForm({ ...form, prize_coin_top1: e.target.value })} className="h-9 text-[13px]" /></div>
                <div><Label className="text-[12px]">🥈 Coins</Label><Input type="number" value={form.prize_coin_top2} onChange={(e) => setForm({ ...form, prize_coin_top2: e.target.value })} className="h-9 text-[13px]" /></div>
                <div><Label className="text-[12px]">🥉 Coins</Label><Input type="number" value={form.prize_coin_top3} onChange={(e) => setForm({ ...form, prize_coin_top3: e.target.value })} className="h-9 text-[13px]" /></div>
              </div>
              <div><Label className="text-[12px]">Prize Description (optional, shown to users)</Label><Input value={form.prize_description} onChange={(e) => setForm({ ...form, prize_description: e.target.value })} placeholder="e.g. প্রথম স্থান পাবেন ফ্রি ইন্টারনেট প্যাক" className="h-9 text-[13px]" /></div>
              <p className="text-[11px] text-muted-foreground">Prizes are credited automatically as coins once the competition ends (hourly sweep). Ranking is computed live from real reading/listening/purchase/referral activity — no separate entry step for users.</p>
              <Button onClick={save} disabled={saveMutation.isPending} className="w-full">{saveMutation.isPending ? "Saving..." : "Create Competition"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {competitions.map((c: any) => (
          <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 bg-secondary/10">
            <Trophy className={`w-5 h-5 shrink-0 ${c.status === "active" ? "text-yellow-500" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{c.title}</span>
                <Badge variant="outline" className="text-[10px]">{METRIC_LABELS[c.metric] || c.metric}</Badge>
                <Badge className={`text-[10px] ${c.status === "active" ? "bg-emerald-500/20 text-emerald-400" : c.status === "completed" ? "bg-secondary text-muted-foreground" : "bg-destructive/20 text-destructive"}`}>{c.status}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(c.start_at), "d MMM")} – {format(new Date(c.end_at), "d MMM yyyy")} · Prizes: {[c.prize_coin_top1, c.prize_coin_top2, c.prize_coin_top3].filter(Boolean).join(" / ")} coins
              </p>
            </div>
            {c.status === "active" && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Cancel this competition? No prizes will be paid out.")) cancelMutation.mutate({ id: c.id }); }}>
                <X className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        {competitions.length === 0 && <p className="text-center text-muted-foreground text-[13px] py-6">No competitions yet.</p>}
      </div>
    </div>
  );
}
