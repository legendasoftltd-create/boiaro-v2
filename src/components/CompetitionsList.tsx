import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { toMediaUrl } from "@/lib/mediaUrl";
import { format } from "date-fns";

const METRIC_LABELS: Record<string, string> = {
  reading_time: "রিডিং টাইম", listening_time: "লিসেনিং টাইম", purchases: "পারচেজ", referrals: "রেফারেল",
};

function CompetitionLeaderboard({ competitionId }: { competitionId: string }) {
  const { data: leaderboard = [] } = trpc.gamification.competitionLeaderboard.useQuery({ competitionId });
  if (leaderboard.length === 0) return <p className="text-[12px] text-muted-foreground py-3 text-center">এখনো কেউ অংশ নেয়নি।</p>;
  return (
    <div className="space-y-1.5 pt-2">
      {(leaderboard as any[]).slice(0, 10).map((entry, i) => (
        <div key={entry.user_id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/10">
          <span className="w-5 text-center text-[12px] font-bold text-muted-foreground">{i + 1}</span>
          <Avatar className="w-6 h-6">
            <AvatarImage src={toMediaUrl(entry.avatar_url) || undefined} />
            <AvatarFallback className="text-[10px]">{(entry.display_name || "U")[0]}</AvatarFallback>
          </Avatar>
          <span className="flex-1 text-[12px] truncate">{entry.display_name || "Anonymous"}</span>
          <span className="text-[12px] font-semibold text-primary">{entry.total}</span>
        </div>
      ))}
    </div>
  );
}

export function CompetitionsList() {
  const { data: competitions = [] } = trpc.gamification.listCompetitions.useQuery();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const active = (competitions as any[]).filter((c) => c.status === "active");

  if (active.length === 0) return null;

  return (
    <Card className="border-border/30 mb-6">
      <CardHeader>
        <CardTitle className="text-base font-serif flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" /> চলমান প্রতিযোগিতা</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active.map((c) => (
          <div key={c.id} className="p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">{c.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {METRIC_LABELS[c.metric] || c.metric} · শেষ হবে {format(new Date(c.end_at), "d MMM")}
                </p>
                {c.prize_description && <p className="text-[11px] text-primary mt-0.5">{c.prize_description}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="gap-1 text-[11px]">
                লিডারবোর্ড {expandedId === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </div>
            {expandedId === c.id && <CompetitionLeaderboard competitionId={c.id} />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
