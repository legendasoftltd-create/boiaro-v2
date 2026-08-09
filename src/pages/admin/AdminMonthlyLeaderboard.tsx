import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Download, RefreshCw, Lock, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const METRICS = [
  { value: "reading", label: "Reading" },
  { value: "listening", label: "Listening" },
  { value: "combined", label: "Combined" },
] as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Entry = {
  id: string | null;
  rank: number;
  user_id: string;
  total_seconds: number;
  display_name: string | null;
  avatar_url: string | null;
  prize_type: string;
  prize_coins: number | null;
  prize_name: string | null;
  prize_status: string;
  winner_confirmed: boolean;
  confirmed_at: string | null;
  locked_at: string | null;
};

function PrizeCell({
  entry, year, month, metric, onSaved,
}: {
  entry: Entry; year: number; month: number; metric: string; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [prizeType, setPrizeType] = useState<"auto" | "manual">((entry.prize_type as "auto" | "manual") ?? "manual");
  const [coins, setCoins] = useState(entry.prize_coins != null ? String(entry.prize_coins) : "");
  const [name, setName] = useState(entry.prize_name ?? "");

  const savePrize = trpc.admin.updateMonthlyLeaderboardPrize.useMutation({
    onSuccess: () => { toast({ title: "Prize saved" }); onSaved(); },
    onError: (e) => toast({ title: "Failed to save prize", description: e.message }),
  });
  const setStatus = trpc.admin.setMonthlyLeaderboardPrizeStatus.useMutation({
    onSuccess: () => { toast({ title: "Prize status updated" }); onSaved(); },
    onError: (e) => toast({ title: "Failed to update status", description: e.message }),
  });

  const save = () => {
    savePrize.mutate({
      year, month, metric: metric as any, rank: entry.rank,
      prizeType,
      prizeCoins: prizeType === "auto" ? Number(coins) || 0 : null,
      prizeName: prizeType === "manual" ? name || null : null,
    });
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[220px]">
      <div className="flex gap-1.5">
        <Select value={prizeType} onValueChange={(v) => setPrizeType(v as "auto" | "manual")}>
          <SelectTrigger className="h-8 w-[92px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="auto">Auto (coins)</SelectItem>
          </SelectContent>
        </Select>
        {prizeType === "auto" ? (
          <Input value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="Coins" type="number" className="h-8 text-[12px]" />
        ) : (
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prize name" className="h-8 text-[12px]" />
        )}
        <Button size="sm" className="h-8 text-[11px] px-2 shrink-0" onClick={save} disabled={savePrize.isPending}>
          {savePrize.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
      </div>
      {entry.id && prizeType === "manual" && (
        <div className="flex items-center gap-2">
          <Badge className={`text-[10px] ${entry.prize_status === "delivered" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
            {entry.prize_status === "delivered" ? "Delivered" : "Pending"}
          </Badge>
          {entry.prize_status !== "delivered" && (
            <button
              className="text-[10px] text-primary underline"
              onClick={() => setStatus.mutate({ id: entry.id!, status: "delivered" })}
            >
              Mark delivered
            </button>
          )}
        </div>
      )}
      {entry.id && prizeType === "auto" && (
        <Badge className={`text-[10px] w-fit ${entry.prize_status === "delivered" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
          {entry.prize_status === "delivered" ? "Paid" : "Pays out on lock"}
        </Badge>
      )}
    </div>
  );
}

export default function AdminMonthlyLeaderboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [metric, setMetric] = useState<(typeof METRICS)[number]["value"]>("reading");

  const utils = trpc.useUtils();
  const { toast } = useToast();

  const { data: entries = [], isLoading } = trpc.admin.listMonthlyLeaderboard.useQuery({ year, month, metric });

  const recalculate = trpc.admin.recalculateMonthlyLeaderboard.useMutation({
    onSuccess: () => { toast({ title: "Recalculated" }); utils.admin.listMonthlyLeaderboard.invalidate(); },
    onError: (e) => toast({ title: "Failed to recalculate", description: e.message }),
  });
  const confirmWinner = trpc.admin.confirmMonthlyLeaderboardWinner.useMutation({
    onSuccess: () => { toast({ title: "Winner confirmed" }); utils.admin.listMonthlyLeaderboard.invalidate(); },
  });

  const isLocked = entries.length > 0 && !!(entries as Entry[])[0]?.locked_at;

  const doRecalculate = () => {
    if (isLocked && !confirm("This month is already locked (archived). Recalculating will overwrite the frozen snapshot. Continue?")) return;
    recalculate.mutate({ year, month, metric });
  };

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  const csvRows = (entries as Entry[]).map((e) => ({
    rank: e.rank,
    user: e.display_name || e.user_id,
    metric,
    time_minutes: Math.round(e.total_seconds / 60),
    winner_confirmed: e.winner_confirmed ? "yes" : "no",
    prize_type: e.prize_type,
    prize: e.prize_type === "auto" ? `${e.prize_coins ?? 0} coins` : (e.prize_name || ""),
    prize_status: e.prize_status,
    locked: e.locked_at ? "yes" : "no",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold">Monthly Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Top 10 per calendar month (Asia/Dhaka), with prize tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportCSV(csvRows, `monthly-leaderboard-${year}-${month}-${metric}`)}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button size="sm" className="gap-1.5" onClick={doRecalculate} disabled={recalculate.isPending}>
            {recalculate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Recalculate
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Tabs value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
          <TabsList>
            {METRICS.map((m) => <TabsTrigger key={m.value} value={m.value} className="text-[13px]">{m.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        {isLocked && (
          <Badge variant="outline" className="gap-1 text-[11px]"><Lock className="w-3 h-3" /> Locked / Archived</Badge>
        )}
      </div>

      <Card className="border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" /> Top 10 — {MONTHS[month - 1]} {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Winner Status</TableHead>
                <TableHead>Prize</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No activity yet for this month</TableCell></TableRow>
              ) : (entries as Entry[]).map((e) => (
                <TableRow key={e.rank}>
                  <TableCell className="font-bold text-muted-foreground">#{e.rank}</TableCell>
                  <TableCell className="text-[13px]">{e.display_name || e.user_id}</TableCell>
                  <TableCell className="text-[13px] font-medium">{formatTime(e.total_seconds)}</TableCell>
                  <TableCell>
                    {e.winner_confirmed ? (
                      <Badge className="gap-1 text-[10px] bg-emerald-500/20 text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Confirmed</Badge>
                    ) : e.id ? (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => confirmWinner.mutate({ id: e.id! })}>
                        Confirm
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Save prize first</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PrizeCell entry={e} year={year} month={month} metric={metric} onSaved={() => utils.admin.listMonthlyLeaderboard.invalidate()} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
