import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Save, TrendingUp, BookOpen, Eye, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RecommendationSetting {
  key: string;
  label: string;
  type: "number" | "boolean";
}

const SETTINGS: RecommendationSetting[] = [
  { key: "rec_system_enabled", label: "Enable Recommendation System", type: "boolean" },
  { key: "rec_ai_enabled", label: "Enable AI Recommendations", type: "boolean" },
  { key: "rec_popularity_weight", label: "Popularity Weight (%)", type: "number" },
  { key: "rec_behavior_weight", label: "User Behavior Weight (%)", type: "number" },
  { key: "rec_recency_weight", label: "New Content Boost (%)", type: "number" },
  { key: "rec_trending_period_days", label: "Trending Period (days)", type: "number" },
  { key: "rec_max_items", label: "Max Recommendations per Section", type: "number" },
];

const DEFAULT_VALUES: Record<string, string> = {
  rec_system_enabled: "true",
  rec_ai_enabled: "true",
  rec_popularity_weight: "40",
  rec_behavior_weight: "40",
  rec_recency_weight: "20",
  rec_trending_period_days: "7",
  rec_max_items: "10",
};

export default function AdminRecommendations() {
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_VALUES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [topViewed, setTopViewed] = useState<any[]>([]);
  const [topSearches, setTopSearches] = useState<any[]>([]);
  const [activityStats, setActivityStats] = useState({ totalViews: 0, totalSearches: 0, uniqueUsers: 0, avgActions: 0 });

  useEffect(() => {
    const load = async () => {
      // Load settings
      const { data: settingsData } = await supabase
        .from("platform_settings")
        .select("*")
        .like("key", "rec_%");
      const map: Record<string, string> = { ...DEFAULT_VALUES };
      ((settingsData as any[]) || []).forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);

      // Load analytics from activity logs
      const { data: activityData } = await supabase
        .from("user_activity_logs" as any)
        .select("event_type, book_id, metadata, user_id")
        .order("created_at", { ascending: false })
        .limit(1000);

      const logs = (activityData as any[]) || [];
      const views = logs.filter(l => l.event_type === "book_view");
      const searches = logs.filter(l => l.event_type === "search");
      const uniqueUserIds = new Set(logs.map(l => l.user_id));

      setActivityStats({
        totalViews: views.length,
        totalSearches: searches.length,
        uniqueUsers: uniqueUserIds.size,
        avgActions: uniqueUserIds.size > 0 ? Math.round(logs.length / uniqueUserIds.size) : 0,
      });

      // Top viewed books
      const viewCounts: Record<string, { count: number; title: string }> = {};
      views.forEach((v: any) => {
        if (v.book_id) {
          if (!viewCounts[v.book_id]) viewCounts[v.book_id] = { count: 0, title: v.metadata?.title || v.book_id.slice(0, 8) };
          viewCounts[v.book_id].count++;
        }
      });
      const sortedViews = Object.entries(viewCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([id, data]) => ({ id, ...data }));
      setTopViewed(sortedViews);

      // Top searches
      const searchCounts: Record<string, number> = {};
      searches.forEach((s: any) => {
        const q = s.metadata?.query;
        if (q) { searchCounts[q] = (searchCounts[q] || 0) + 1; }
      });
      const sortedSearches = Object.entries(searchCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([query, count]) => ({ query, count }));
      setTopSearches(sortedSearches);

      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith("rec_")) {
        await supabase
          .from("platform_settings")
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      }
    }
    toast.success("Recommendation settings saved");
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Views", value: activityStats.totalViews, icon: Eye, color: "text-blue-400" },
    { label: "Total Searches", value: activityStats.totalSearches, icon: BarChart3, color: "text-emerald-400" },
    { label: "Active Users", value: activityStats.uniqueUsers, icon: TrendingUp, color: "text-purple-400" },
    { label: "Avg Actions/User", value: activityStats.avgActions, icon: BookOpen, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2 text-black">
           Recommendations & AI
        </h1>
        
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <Card key={s.label} className="border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-secondary/60">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="bg-transparent  w-full flex items-center gap-4 mb-4">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6 mt-4">
          {/* Toggles */}
          <Card className="border-border/30">
            <CardHeader><CardTitle className="text-base">System Toggles</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {SETTINGS.filter(s => s.type === "boolean").map(cfg => (
                <div key={cfg.key} className="flex items-center justify-between">
                  <Label>{cfg.label}</Label>
                  <Switch
                    checked={settings[cfg.key] === "true"}
                    onCheckedChange={v => setSettings(p => ({ ...p, [cfg.key]: String(v) }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Weights */}
          <Card className="border-border/30">
            <CardHeader><CardTitle className="text-base">Recommendation Weights</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {SETTINGS.filter(s => s.type === "number").map(cfg => (
                <div key={cfg.key} className="space-y-1.5">
                  <Label>{cfg.label}</Label>
                  <Input
                    type="number"
                    value={settings[cfg.key] || "0"}
                    onChange={e => setSettings(p => ({ ...p, [cfg.key]: e.target.value }))}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Popularity + Behavior + Recency weights should total 100%
              </p>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save Settings"}
          </Button>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6 mt-4">
          {/* Top Viewed */}
          <Card className="border-border/30">
            <CardHeader><CardTitle className="text-base">Top Viewed Books</CardTitle></CardHeader>
            <CardContent>
              {topViewed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No view data yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-white hover:text-black">#</TableHead>
                      <TableHead className="text-white ">Book</TableHead>
                      <TableHead className="text-white text-right ">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topViewed.map((b, i) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                        <TableCell className="font-medium">{b.title}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-blue-500/20 text-blue-400">{b.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Top Searches */}
          <Card className="border-border/30">
            <CardHeader><CardTitle className="text-base">Top Searches</CardTitle></CardHeader>
            <CardContent>
              {topSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No search data yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Query</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSearches.map((s, i) => (
                      <TableRow key={s.query}>
                        <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.query}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-emerald-500/20 text-emerald-400">{s.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
