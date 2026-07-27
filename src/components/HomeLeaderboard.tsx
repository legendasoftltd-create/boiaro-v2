import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crown, Trophy, BookOpen, Headphones, Coins } from "lucide-react";

const METRICS = [
  { value: "reading", label: "পড়া", icon: BookOpen },
  { value: "listening", label: "শোনা", icon: Headphones },
  { value: "coins", label: "কয়েন", icon: Coins },
] as const;

const PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

function formatTotal(total: number, metric: string): string {
  if (metric === "coins") return `${total.toLocaleString()} coins`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function HomeLeaderboard() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("weekly");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["value"]>("reading");

  const { data: leaderboard = [], isLoading } = trpc.gamification.homeLeaderboard.useQuery({ period, metric });

  if (!isLoading && leaderboard.length === 0) return null;

  return (
    <section className="section-container">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-6 flex-wrap gap-3">
          <div className="section-header mb-0">
            <div className="section-icon bg-yellow-500/10">
              <Crown className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-foreground">
                লিডার<span className="text-yellow-500">বোর্ড</span>
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">সবচেয়ে বেশি পড়া ও শোনা ইউজাররা</p>
            </div>
          </div>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <TabsList className="bg-secondary/40 border border-border/30 h-auto p-1">
              {PERIODS.map((p) => (
                <TabsTrigger key={p.value} value={p.value} className="text-[12px] px-3 py-1">{p.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex gap-2 mb-4">
          {METRICS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border transition-colors ${
                metric === m.value
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary/20 border-border/20 text-muted-foreground hover:text-foreground"
              }`}
            >
              <m.icon className="w-3.5 h-3.5" /> {m.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-secondary/20" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {leaderboard.slice(0, 10).map((entry: any) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                  entry.rank <= 3 ? "border-yellow-500/30 bg-yellow-500/5" : "border-border/20 bg-secondary/10"
                }`}
              >
                <div className="w-6 text-center">
                  {entry.rank === 1 ? <Trophy className="w-4 h-4 text-yellow-500 mx-auto" /> : <span className="text-[13px] font-bold text-muted-foreground">{entry.rank}</span>}
                </div>
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-[11px]">{(entry.display_name || "U")[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{entry.display_name || "Anonymous Reader"}</p>
                </div>
                <span className="text-[12px] font-semibold text-primary">{formatTotal(entry.total, metric)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
