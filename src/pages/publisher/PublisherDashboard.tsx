import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Package, DollarSign, Wallet, Clock, Headphones } from "lucide-react";

export default function PublisherDashboard() {
  const { profile } = useAuth();
  const { data: stats } = trpc.profiles.creatorStats.useQuery({ role: "publisher" });

  const cards = [
    { label: "Published Books", value: stats?.bookCount ?? 0, icon: BookOpen, color: "text-primary" },
    { label: "eBook Revenue", value: `৳${(stats?.revenueByFormat.ebook ?? 0).toFixed(0)}`, icon: BookOpen, color: "text-blue-400" },
    { label: "Audiobook Revenue", value: `৳${(stats?.revenueByFormat.audiobook ?? 0).toFixed(0)}`, icon: Headphones, color: "text-purple-400" },
    { label: "Hardcopy Revenue", value: `৳${(stats?.revenueByFormat.hardcopy ?? 0).toFixed(0)}`, icon: Package, color: "text-orange-400" },
    { label: "Total Earnings", value: `৳${(stats?.totalEarnings ?? 0).toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
    { label: "Available Balance", value: `৳${(stats?.availableBalance ?? 0).toFixed(0)}`, icon: Wallet, color: "text-emerald-400" },
    { label: "Pending Payout", value: `৳${(stats?.pendingPayout ?? 0).toFixed(0)}`, icon: Clock, color: "text-yellow-400" },
    { label: "Withdrawn", value: `৳${(stats?.withdrawn ?? 0).toFixed(0)}`, icon: DollarSign, color: "text-blue-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold">Welcome, {profile?.display_name || "Publisher"}</h1>
        <p className="text-muted-foreground text-sm">Manage your publications and track revenue.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(s => (
          <Card key={s.label} className="border-border/30 bg-card/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-secondary ${s.color}`}>
                <s.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/30 bg-card/60">
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Your publishing activity and sales will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
