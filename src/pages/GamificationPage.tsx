import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, Trophy, Target, Award, Crown, Star, BookOpen, Headphones, Coins, Users, Zap, Medal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BadgeDef {
  id: string; key: string; title: string; description: string | null;
  category: string; condition_type: string; condition_value: number | null;
  coin_reward: number | null; is_active: boolean | null;
}
interface UserBadge { badge_id: string; earned_at: string; badge_definitions: BadgeDef | null }
interface Streak { current_streak: number; best_streak: number; last_activity_date: string | null }
interface Goal { id: string; goal_type: string; target_value: number; current_value: number | null; period: string; status: string; started_at: string }
interface LeaderEntry { user_id: string; total: number; display_name: string | null }

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
const GOAL_TYPES = [
  { value: "read_minutes", label: "Read (minutes/day)", icon: BookOpen },
  { value: "listen_minutes", label: "Listen (minutes/day)", icon: Headphones },
  { value: "books_month", label: "Books per month", icon: Target },
];

const categoryIcons: Record<string, any> = {
  reading: BookOpen, listening: Headphones, streak: Flame, engagement: Coins,
  social: Users, special: Star, achievement: Crown, general: Award,
};

export default function GamificationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<UserBadge[]>([]);
  const [streak, setStreak] = useState<Streak>({ current_streak: 0, best_streak: 0, last_activity_date: null });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [leaderType, _setLeaderType] = useState("points");
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  // New goal form
  const [newGoalType, setNewGoalType] = useState("read_minutes");
  const [newGoalTarget, setNewGoalTarget] = useState("30");

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    loadLeaderboard();
  }, [leaderType]);

  const loadData = async () => {
    if (!user) { setLoading(false); return; }
    const [badgeRes, earnedRes, streakRes, goalRes, pointsRes] = await Promise.all([
      supabase.from("badge_definitions").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("user_badges").select("badge_id, earned_at, badge_definitions(*)").eq("user_id", user.id),
      supabase.from("user_streaks").select("current_streak, best_streak, last_activity_date").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_goals").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }),
      supabase.from("gamification_points").select("points").eq("user_id", user.id),
    ]);
    setBadges((badgeRes.data as any) || []);
    setEarnedBadges((earnedRes.data as any) || []);
    if (streakRes.data) setStreak(streakRes.data as any);
    setGoals((goalRes.data as any) || []);
    setTotalPoints(((pointsRes.data as any) || []).reduce((s: number, r: any) => s + (r.points || 0), 0));
    setLoading(false);
  };

  const loadLeaderboard = async () => {
    const { data } = await supabase.from("gamification_points").select("user_id, points").order("points", { ascending: false }).limit(50);
    if (!data || data.length === 0) { setLeaderboard([]); return; }
    // Aggregate by user
    const map = new Map<string, number>();
    data.forEach((r: any) => { map.set(r.user_id, (map.get(r.user_id) || 0) + r.points); });
    const userIds = [...map.keys()];
    const { data: profiles } = await supabase.from("profiles_public" as any).select("user_id, display_name").in("user_id", userIds);
    const pMap = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));
    const entries = [...map.entries()].map(([uid, total]) => ({ user_id: uid, total, display_name: pMap.get(uid) || "User" })).sort((a, b) => b.total - a.total).slice(0, 20);
    setLeaderboard(entries);
  };

  const earnedIds = useMemo(() => new Set(earnedBadges.map(b => b.badge_id)), [earnedBadges]);
  const nextMilestone = STREAK_MILESTONES.find(m => m > streak.current_streak) || 100;
  const milestoneProgress = Math.min(100, (streak.current_streak / nextMilestone) * 100);

  const addGoal = async () => {
    if (!user) return;
    const target = parseInt(newGoalTarget);
    if (!target || target < 1) return;
    const { error } = await supabase.from("user_goals").insert({ user_id: user.id, goal_type: newGoalType, target_value: target, period: "daily" });
    if (!error) { toast({ title: "Goal created!" }); loadData(); }
  };

  const myRank = leaderboard.findIndex(e => e.user_id === user?.id) + 1;

  if (loading) return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-14 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
    </main>
  );

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-24 pb-14">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-serif font-bold text-foreground mb-6 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" /> Gamification Center
          </h1>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className="border-border/30 bg-card/60">
              <CardContent className="p-4 text-center">
                <Flame className="w-6 h-6 mx-auto text-orange-500 mb-1" />
                <p className="text-2xl font-bold text-foreground">{streak.current_streak}</p>
                <p className="text-[11px] text-muted-foreground">Day Streak</p>
              </CardContent>
            </Card>
            <Card className="border-border/30 bg-card/60">
              <CardContent className="p-4 text-center">
                <Zap className="w-6 h-6 mx-auto text-yellow-500 mb-1" />
                <p className="text-2xl font-bold text-foreground">{totalPoints}</p>
                <p className="text-[11px] text-muted-foreground">Total Points</p>
              </CardContent>
            </Card>
            <Card className="border-border/30 bg-card/60">
              <CardContent className="p-4 text-center">
                <Award className="w-6 h-6 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold text-foreground">{earnedBadges.length}</p>
                <p className="text-[11px] text-muted-foreground">Badges Earned</p>
              </CardContent>
            </Card>
            <Card className="border-border/30 bg-card/60">
              <CardContent className="p-4 text-center">
                <Medal className="w-6 h-6 mx-auto text-emerald-500 mb-1" />
                <p className="text-2xl font-bold text-foreground">{myRank > 0 ? `#${myRank}` : "—"}</p>
                <p className="text-[11px] text-muted-foreground">Rank</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="streak" className="space-y-5">
            <TabsList className="bg-secondary/40 border border-border/30 flex-wrap h-auto gap-0.5 p-1">
              <TabsTrigger value="streak" className="gap-1.5 text-[13px]"><Flame className="w-3.5 h-3.5" /> Streak</TabsTrigger>
              <TabsTrigger value="goals" className="gap-1.5 text-[13px]"><Target className="w-3.5 h-3.5" /> Goals</TabsTrigger>
              <TabsTrigger value="badges" className="gap-1.5 text-[13px]"><Award className="w-3.5 h-3.5" /> Badges</TabsTrigger>
              <TabsTrigger value="leaderboard" className="gap-1.5 text-[13px]"><Crown className="w-3.5 h-3.5" /> Leaderboard</TabsTrigger>
            </TabsList>

            {/* STREAK TAB */}
            <TabsContent value="streak">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Flame className="w-5 h-5 text-orange-500" /> Daily Streak</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-full border-4 border-orange-500/30 flex items-center justify-center bg-orange-500/5">
                        <span className="text-3xl font-bold text-orange-500">{streak.current_streak}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Current</p>
                    </div>
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full border-2 border-primary/20 flex items-center justify-center bg-primary/5">
                        <span className="text-xl font-bold text-primary">{streak.best_streak}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Best</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-1">Next milestone: {nextMilestone} days</p>
                      <Progress value={milestoneProgress} className="h-2" />
                      <p className="text-[11px] text-muted-foreground mt-1">{streak.current_streak}/{nextMilestone} days</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium mb-2">Streak Milestones</p>
                    <div className="flex flex-wrap gap-2">
                      {STREAK_MILESTONES.map(m => (
                        <Badge key={m} variant={streak.best_streak >= m ? "default" : "outline"} className={`text-[11px] ${streak.best_streak >= m ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : ""}`}>
                          {m} days {streak.best_streak >= m ? "✓" : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {streak.last_activity_date && (
                    <p className="text-[11px] text-muted-foreground">Last active: {new Date(streak.last_activity_date).toLocaleDateString()}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* GOALS TAB */}
            <TabsContent value="goals">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Target className="w-5 h-5 text-primary" /> Reading Goals</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {/* Add goal */}
                  <div className="flex gap-2 items-end flex-wrap">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Goal Type</p>
                      <Select value={newGoalType} onValueChange={setNewGoalType}>
                        <SelectTrigger className="w-48 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GOAL_TYPES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Target</p>
                      <Input type="number" value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} className="w-24 h-9 text-[13px]" />
                    </div>
                    <Button size="sm" onClick={addGoal} className="h-9 text-[13px]">Set Goal</Button>
                  </div>

                  {goals.length > 0 ? (
                    <div className="space-y-3">
                      {goals.map(g => {
                        const pct = Math.min(100, ((g.current_value || 0) / g.target_value) * 100);
                        const GoalIcon = GOAL_TYPES.find(t => t.value === g.goal_type)?.icon || Target;
                        return (
                          <div key={g.id} className="p-3 rounded-lg border border-border/20 bg-secondary/20">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <GoalIcon className="w-4 h-4 text-primary" />
                                <span className="text-[13px] font-medium">{GOAL_TYPES.find(t => t.value === g.goal_type)?.label || g.goal_type}</span>
                                <Badge variant="outline" className="text-[10px]">{g.period}</Badge>
                              </div>
                              <span className="text-[13px] font-bold">{g.current_value || 0}/{g.target_value}</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-[13px] py-6">No active goals. Set one above!</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* BADGES TAB */}
            <TabsContent value="badges">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Award className="w-5 h-5 text-primary" /> Badges & Achievements</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {badges.map(b => {
                      const earned = earnedIds.has(b.id);
                      const CatIcon = categoryIcons[b.category] || Award;
                      return (
                        <div key={b.id} className={`p-3 rounded-xl border text-center transition-all ${earned ? "border-primary/30 bg-primary/5" : "border-border/20 bg-secondary/10 opacity-50"}`}>
                          <CatIcon className={`w-8 h-8 mx-auto mb-2 ${earned ? "text-primary" : "text-muted-foreground"}`} />
                          <p className={`text-[13px] font-medium ${earned ? "text-foreground" : "text-muted-foreground"}`}>{b.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{b.description}</p>
                          {b.coin_reward && b.coin_reward > 0 && (
                            <Badge variant="outline" className="mt-1.5 text-[10px]"><Coins className="w-2.5 h-2.5 mr-0.5" />{b.coin_reward}</Badge>
                          )}
                          {earned && <p className="text-[10px] text-primary mt-1">✓ Earned</p>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* LEADERBOARD TAB */}
            <TabsContent value="leaderboard">
              <Card className="border-border/30 bg-card/60">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Crown className="w-5 h-5 text-yellow-500" /> Leaderboard</CardTitle></CardHeader>
                <CardContent>
                  {leaderboard.length > 0 ? (
                    <div className="space-y-1.5">
                      {leaderboard.map((e, i) => {
                        const isMe = e.user_id === user?.id;
                        return (
                          <div key={e.user_id} className={`flex items-center gap-3 p-2.5 rounded-lg ${isMe ? "bg-primary/10 border border-primary/20" : i < 3 ? "bg-secondary/30" : ""}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${i === 0 ? "bg-yellow-500/20 text-yellow-500" : i === 1 ? "bg-gray-400/20 text-gray-400" : i === 2 ? "bg-orange-600/20 text-orange-600" : "bg-secondary text-muted-foreground"}`}>
                              {i + 1}
                            </div>
                            <span className={`flex-1 text-[13px] ${isMe ? "font-bold text-primary" : "font-medium"}`}>
                              {e.display_name || "User"} {isMe && "(You)"}
                            </span>
                            <span className="text-[13px] font-bold">{e.total} pts</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-[13px] py-8">No leaderboard data yet. Start reading to earn points!</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Footer />
    </main>
  );
}
