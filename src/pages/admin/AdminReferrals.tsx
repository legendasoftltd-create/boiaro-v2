import { useState, useEffect } from "react";
import { Users, Coins, Trophy, TrendingUp, Settings, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SummaryCard from '@/components/admin/SummaryCard';

interface Referral {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  referral_code: string;
  status: string;
  reward_amount: number;
  reward_status: string;
  source: string;
  ip_address: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ReferralSettings {
  referral_enabled: boolean;
  referral_signup_reward: number;
  referral_first_read_reward: number;
  referral_first_unlock_reward: number;
  referral_referred_bonus: number;
  referral_max_per_day: number;
  referral_max_rewards_per_day: number;
}

export default function AdminReferrals() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [settings, setSettings] = useState<ReferralSettings>({
    referral_enabled: true,
    referral_signup_reward: 10,
    referral_first_read_reward: 20,
    referral_first_unlock_reward: 30,
    referral_referred_bonus: 5,
    referral_max_per_day: 10,
    referral_max_rewards_per_day: 50,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, coinsDistributed: 0 });

  useEffect(() => {
    loadReferrals();
    loadSettings();
  }, []);

  const loadReferrals = async () => {
    const { data } = await supabase
      .from("referrals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) {
      setReferrals(data as Referral[]);
      const completed = data.filter((r) => r.status === "completed").length;
      const coinsDistributed = data
        .filter((r) => r.reward_status === "paid")
        .reduce((s, r) => s + (r.reward_amount || 0), 0);
      setStats({
        total: data.length,
        completed,
        pending: data.filter((r) => r.status === "pending").length,
        coinsDistributed,
      });
    }
  };

  const loadSettings = async () => {
    const keys = Object.keys(settings);
    const { data } = await supabase.from("platform_settings").select("key, value").in("key", keys);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r) => (map[r.key] = r.value));
      setSettings({
        referral_enabled: map.referral_enabled !== "false",
        referral_signup_reward: parseInt(map.referral_signup_reward) || 10,
        referral_first_read_reward: parseInt(map.referral_first_read_reward) || 20,
        referral_first_unlock_reward: parseInt(map.referral_first_unlock_reward) || 30,
        referral_referred_bonus: parseInt(map.referral_referred_bonus) || 5,
        referral_max_per_day: parseInt(map.referral_max_per_day) || 10,
        referral_max_rewards_per_day: parseInt(map.referral_max_rewards_per_day) || 50,
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(settings).map(([key, val]) =>
      supabase.from("platform_settings").upsert(
        { key, value: String(val), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
    );
    await Promise.all(entries);
    toast.success("Referral settings saved");
    setSaving(false);
  };

  const filtered = referrals.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.referral_code.toLowerCase().includes(q) ||
        r.referrer_id.toLowerCase().includes(q) ||
        (r.referred_user_id || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Compute top referrers
  const referrerMap = new Map<string, { count: number; earned: number }>();
  referrals.forEach((r) => {
    const existing = referrerMap.get(r.referrer_id) || { count: 0, earned: 0 };
    existing.count++;
    if (r.reward_status === "paid") existing.earned += r.reward_amount;
    referrerMap.set(r.referrer_id, existing);
  });
  const topReferrers = Array.from(referrerMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-black">Referral System</h1>
        </div>
        <Badge variant={settings.referral_enabled ? "default" : "secondary"}>
          {settings.referral_enabled ? "Active" : "Disabled"}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: "Total Referrals", value: stats.total, color: "#074fad" },
          { icon: TrendingUp, label: "Completed", value: stats.completed, color: "#017B51" },
          { icon: Coins, label: "Coins Distributed", value: stats.coinsDistributed, color: "#017B51" },
          { icon: Trophy, label: "Pending", value: stats.pending, color: "rgb(238, 42, 7)" },
        ].map((s) => (
          // <Card key={s.label} className="bg-card border-border">
          //   <CardContent className="p-4">
          //     <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
          //     <p className="text-xs text-muted-foreground">{s.label}</p>
          //     <p className="text-xl font-bold text-foreground">{s.value}</p>
          //   </CardContent>
          // </Card>
          <SummaryCard
          icon={s.icon}
          title={s.label}
          value={s.value}
          color={s.color}
        />
        ))}
      </div>

      <Tabs defaultValue="referrals">
        <TabsList className="w-full flex items-center justify-center gap-5">
          <TabsTrigger value="referrals">All Referrals</TabsTrigger>
          <TabsTrigger value="leaderboard">Top Referrers</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="referrals" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by code or user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadReferrals}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>

          <Card className="">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referred</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-black py-8">
                      No referrals found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-black">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.referral_code}</TableCell>
                      <TableCell className="font-mono text-xs">{r.referrer_id.slice(0, 8)}…</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.referred_user_id ? `${r.referred_user_id.slice(0, 8)}…` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "completed" ? "default" : r.status === "rejected" ? "destructive" : "secondary"
                          }
                          className="text-xs"
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-primary">+{r.reward_amount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-4">
          <Card className="">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" /> Top Referrers
              </CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Referrals</TableHead>
                  <TableHead>Earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topReferrers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-black py-8">
                      No data yet
                    </TableCell>
                  </TableRow>
                ) : (
                  topReferrers.map(([userId, data], i) => (
                    <TableRow key={userId}>
                      <TableCell>
                        <Badge variant={i < 3 ? "default" : "secondary"} className="text-xs">
                          #{i + 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{userId.slice(0, 12)}…</TableCell>
                      <TableCell className="font-medium">{data.count}</TableCell>
                      <TableCell className="text-primary font-medium">{data.earned} coins</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card className=" border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-5 h-5" /> Referral Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-">Enable Referral System</p>
                  <p className="text-xs text-muted-">Users can invite friends and earn coins</p>
                </div>
                <Switch
                  checked={settings.referral_enabled}
                  onCheckedChange={(v) => setSettings((p) => ({ ...p, referral_enabled: v }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium ">Signup Reward (coins)</label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.referral_signup_reward}
                    onChange={(e) => setSettings((p) => ({ ...p, referral_signup_reward: parseInt(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-mediu">Referred User Bonus (coins)</label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.referral_referred_bonus}
                    onChange={(e) => setSettings((p) => ({ ...p, referral_referred_bonus: parseInt(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-mediu">First Read Reward (coins)</label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.referral_first_read_reward}
                    onChange={(e) => setSettings((p) => ({ ...p, referral_first_read_reward: parseInt(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-mediu">First Unlock Reward (coins)</label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.referral_first_unlock_reward}
                    onChange={(e) => setSettings((p) => ({ ...p, referral_first_unlock_reward: parseInt(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-mediu">Max Referrals Per Day</label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.referral_max_per_day}
                    onChange={(e) => setSettings((p) => ({ ...p, referral_max_per_day: parseInt(e.target.value) || 10 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Reward Coins Per Day</label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.referral_max_rewards_per_day}
                    onChange={(e) => setSettings((p) => ({ ...p, referral_max_rewards_per_day: parseInt(e.target.value) || 50 }))}
                    className="mt-1"
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
