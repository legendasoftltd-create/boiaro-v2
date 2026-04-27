import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, MousePointerClick, Coins, TrendingUp, BarChart3, Gift } from "lucide-react";

export default function AdminAdReports() {
  const { data, isLoading: loading } = trpc.admin.adReportSummary.useQuery();
  const bannerStats = (data?.banners as any[]) || [];
  const rewardedCount = data?.rewardedCount || 0;
  const totalCoinsGiven = data?.totalCoinsGiven || 0;
  const totalImpressions = data?.totalImpressions || 0;
  const totalClicks = data?.totalClicks || 0;

  const overallCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) + "%" : "0%";

  const statCards = [
    { label: "Total Impressions", value: totalImpressions.toLocaleString(), icon: Eye, color: "text-blue-400" },
    { label: "Total Clicks", value: totalClicks.toLocaleString(), icon: MousePointerClick, color: "text-emerald-400" },
    { label: "Overall CTR", value: overallCtr, icon: TrendingUp, color: "text-primary" },
    { label: "Rewarded Views", value: rewardedCount.toLocaleString(), icon: Gift, color: "text-amber-400" },
    { label: "Coins Distributed", value: totalCoinsGiven.toLocaleString(), icon: Coins, color: "text-purple-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Ad Reports</h1>
        <p className="text-muted-foreground text-sm">Ad performance analytics and earnings overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map(s => (
          <Card key={s.label} className="border-border/30">
            <CardContent className="p-4 text-center">
              <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
              <p className="text-xl font-bold">{loading ? "—" : s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/30">
        <CardHeader><CardTitle className="text-base">Banner Performance</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Banner</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : bannerStats.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No banner data</TableCell></TableRow>
            ) : bannerStats.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium text-sm">{b.title || "Untitled"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[11px]">{b.placement_key}</Badge></TableCell>
                <TableCell><Badge className={b.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary"}>{b.status}</Badge></TableCell>
                <TableCell className="text-right">{(b.impressions || 0).toLocaleString()}</TableCell>
                <TableCell className="text-right">{(b.clicks || 0).toLocaleString()}</TableCell>
                <TableCell className="text-right font-medium">{b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) + "%" : "0%"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
