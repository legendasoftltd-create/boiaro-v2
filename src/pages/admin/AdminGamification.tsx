import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trophy, Award, Flame, Target, Plus, Edit, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BadgeDef {
  id: string; key: string; title: string; description: string | null;
  category: string; condition_type: string; condition_value: number | null;
  coin_reward: number | null; is_active: boolean | null; sort_order: number | null;
}

export default function AdminGamification() {
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [stats, setStats] = useState({ totalStreakUsers: 0, totalBadgesEarned: 0, totalPoints: 0, activeGoals: 0 });
  const [loading, setLoading] = useState(true);

  // Badge form
  const [showForm, setShowForm] = useState(false);
  const [editBadge, setEditBadge] = useState<BadgeDef | null>(null);
  const [form, setForm] = useState({ key: "", title: "", description: "", category: "general", condition_type: "manual", condition_value: "0", coin_reward: "0", sort_order: "0" });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const data = await utils.admin.gamificationData.fetch();
    setBadges((data.badges as any) || []);
    setStats(data.stats || { totalStreakUsers: 0, totalBadgesEarned: 0, totalPoints: 0, activeGoals: 0 });
    setLoading(false);
  };

  const openEdit = (b: BadgeDef) => {
    setEditBadge(b);
    setForm({ key: b.key, title: b.title, description: b.description || "", category: b.category, condition_type: b.condition_type, condition_value: String(b.condition_value || 0), coin_reward: String(b.coin_reward || 0), sort_order: String(b.sort_order || 0) });
    setShowForm(true);
  };

  const openNew = () => {
    setEditBadge(null);
    setForm({ key: "", title: "", description: "", category: "general", condition_type: "manual", condition_value: "0", coin_reward: "0", sort_order: "0" });
    setShowForm(true);
  };

  const saveBadge = async () => {
    const conditionValue = Number.parseInt(form.condition_value, 10);
    const coinReward = Number.parseInt(form.coin_reward, 10);
    const sortOrder = Number.parseInt(form.sort_order, 10);
    if (!Number.isFinite(conditionValue) || !Number.isFinite(coinReward) || !Number.isFinite(sortOrder)) {
      toast({ title: "Invalid numeric values", description: "Condition value, coin reward, and sort order must be valid numbers." });
      return;
    }

    const payload = {
      key: form.key,
      title: form.title,
      description: form.description || null,
      category: form.category,
      condition_type: form.condition_type,
      condition_value: conditionValue,
      coin_reward: coinReward,
      sort_order: sortOrder,
    };
    if (editBadge) {
      await utils.admin.upsertBadgeDefinition.fetch({ ...payload, id: editBadge.id });
    } else {
      await utils.admin.upsertBadgeDefinition.fetch(payload);
    }
    setShowForm(false);
    toast({ title: editBadge ? "Badge updated" : "Badge created" });
    load();
  };

  const toggleBadge = async (id: string, active: boolean) => {
    await utils.admin.setBadgeDefinitionActive.fetch({ id, is_active: active });
    setBadges(prev => prev.map(b => b.id === id ? { ...b, is_active: active } : b));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> Gamification</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/30"><CardContent className="p-4 text-center">
          <Flame className="w-5 h-5 mx-auto text-orange-500 mb-1" />
          <p className="text-xl font-bold">{stats.totalStreakUsers}</p>
          <p className="text-[11px] text-muted-foreground">Streak Users</p>
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-4 text-center">
          <Award className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-xl font-bold">{stats.totalBadgesEarned}</p>
          <p className="text-[11px] text-muted-foreground">Badges Earned</p>
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-4 text-center">
          <Zap className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
          <p className="text-xl font-bold">{stats.totalPoints}</p>
          <p className="text-[11px] text-muted-foreground">Total Points</p>
        </CardContent></Card>
        <Card className="border-border/30"><CardContent className="p-4 text-center">
          <Target className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
          <p className="text-xl font-bold">{stats.activeGoals}</p>
          <p className="text-[11px] text-muted-foreground">Active Goals</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="badges">
        <TabsList className="bg-secondary/40 border border-border/30">
          <TabsTrigger value="badges" className="text-[13px]">Badge Management</TabsTrigger>
          <TabsTrigger value="settings" className="text-[13px]">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="badges" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold">Badge Definitions</h2>
            <Dialog open={showForm} onOpenChange={setShowForm}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openNew} className="text-[13px] gap-1"><Plus className="w-3.5 h-3.5" /> Add Badge</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editBadge ? "Edit Badge" : "New Badge"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-[12px]">Key</Label><Input value={form.key} onChange={e => setForm({...form, key: e.target.value})} className="h-9 text-[13px]" /></div>
                    <div><Label className="text-[12px]">Title</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-9 text-[13px]" /></div>
                  </div>
                  <div><Label className="text-[12px]">Description</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="h-9 text-[13px]" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-[12px]">Category</Label>
                      <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                        <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["general","reading","listening","streak","engagement","social","special","achievement"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-[12px]">Condition Type</Label>
                      <Select value={form.condition_type} onValueChange={v => setForm({...form, condition_type: v})}>
                        <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["manual","streak","read_count","listen_count","coins_earned","referral_count","goal_complete"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-[12px]">Condition Value</Label><Input type="number" value={form.condition_value} onChange={e => setForm({...form, condition_value: e.target.value})} className="h-9 text-[13px]" /></div>
                    <div><Label className="text-[12px]">Coin Reward</Label><Input type="number" value={form.coin_reward} onChange={e => setForm({...form, coin_reward: e.target.value})} className="h-9 text-[13px]" /></div>
                    <div><Label className="text-[12px]">Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: e.target.value})} className="h-9 text-[13px]" /></div>
                  </div>
                  <Button onClick={saveBadge} className="w-full text-[13px]">Save Badge</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {badges.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 bg-secondary/10">
                <Award className={`w-5 h-5 shrink-0 ${b.is_active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{b.title}</span>
                    <Badge variant="outline" className="text-[10px]">{b.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">{b.condition_type}: {b.condition_value}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{b.description} · Reward: {b.coin_reward} coins</p>
                </div>
                <Switch checked={b.is_active ?? true} onCheckedChange={v => toggleBadge(b.id, v)} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}><Edit className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card className="border-border/30">
            <CardHeader className="pb-3"><CardTitle className="text-base">Gamification Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-secondary/10">
                <div>
                  <p className="text-[13px] font-medium">Enable Gamification</p>
                  <p className="text-[11px] text-muted-foreground">Toggle the entire gamification system</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-secondary/10">
                <div>
                  <p className="text-[13px] font-medium">Show Leaderboard</p>
                  <p className="text-[11px] text-muted-foreground">Show leaderboard to users</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-secondary/10">
                <div>
                  <p className="text-[13px] font-medium">Streak Grace Period</p>
                  <p className="text-[11px] text-muted-foreground">Allow 1 missed day before resetting streak (future)</p>
                </div>
                <Switch />
              </div>
              <div className="p-3 rounded-lg border border-border/20 bg-secondary/10">
                <p className="text-[13px] font-medium mb-2">Points per Activity</p>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div className="flex justify-between"><span>Read session</span><span className="font-medium">5 pts</span></div>
                  <div className="flex justify-between"><span>Listen session</span><span className="font-medium">5 pts</span></div>
                  <div className="flex justify-between"><span>Goal complete</span><span className="font-medium">20 pts</span></div>
                  <div className="flex justify-between"><span>Streak milestone</span><span className="font-medium">50 pts</span></div>
                  <div className="flex justify-between"><span>Badge unlock</span><span className="font-medium">10 pts</span></div>
                  <div className="flex justify-between"><span>Referral success</span><span className="font-medium">30 pts</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
