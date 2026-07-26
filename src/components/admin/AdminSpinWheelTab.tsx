import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Segment {
  label: string;
  coin_reward: number;
  weight: number;
}

export function AdminSpinWheelTab() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.admin.getSpinWheelConfig.useQuery();
  const saveMutation = trpc.admin.upsertSpinWheelConfig.useMutation({
    onSuccess: () => { utils.admin.getSpinWheelConfig.invalidate(); toast({ title: "Spin wheel saved" }); },
  });

  const [isActive, setIsActive] = useState(true);
  const [spinsPerDay, setSpinsPerDay] = useState("1");
  const [segments, setSegments] = useState<Segment[]>([{ label: "৫ কয়েন", coin_reward: 5, weight: 1 }]);

  useEffect(() => {
    if (config) {
      setIsActive(config.is_active);
      setSpinsPerDay(String(config.spins_per_day));
      setSegments((config.segments as any) || []);
    }
  }, [config]);

  const updateSegment = (i: number, field: keyof Segment, value: string) => {
    setSegments((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: field === "label" ? value : Number(value) || 0 } : s));
  };

  const addSegment = () => setSegments((prev) => [...prev, { label: "নতুন পুরস্কার", coin_reward: 5, weight: 1 }]);
  const removeSegment = (i: number) => setSegments((prev) => prev.filter((_, idx) => idx !== i));

  const save = () => {
    const perDay = Number.parseInt(spinsPerDay, 10);
    if (!Number.isFinite(perDay) || perDay < 1) {
      toast({ title: "Spins per day must be a valid number ≥ 1" });
      return;
    }
    saveMutation.mutate({ id: (config as any)?.id, is_active: isActive, spins_per_day: perDay, segments });
  };

  if (isLoading) return <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Lucky Spin Wheel</CardTitle>
        <div className="flex items-center gap-2">
          <Label className="text-[12px]">Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-40">
          <Label className="text-[12px]">Spins per day (per user)</Label>
          <Input type="number" min={1} value={spinsPerDay} onChange={(e) => setSpinsPerDay(e.target.value)} className="h-9 text-[13px]" />
        </div>

        <div className="space-y-2">
          <Label className="text-[12px]">Wheel Segments</Label>
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={seg.label} onChange={(e) => updateSegment(i, "label", e.target.value)} placeholder="Label" className="h-9 text-[13px] flex-1" />
              <Input type="number" value={seg.coin_reward} onChange={(e) => updateSegment(i, "coin_reward", e.target.value)} placeholder="Coins" className="h-9 text-[13px] w-24" />
              <Input type="number" step="0.1" value={seg.weight} onChange={(e) => updateSegment(i, "weight", e.target.value)} placeholder="Weight" className="h-9 text-[13px] w-24" />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeSegment(i)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Weight controls odds (higher = more likely), not slice size. Coins = 0 is a valid "no win" segment.</p>
          <Button size="sm" variant="outline" onClick={addSegment} className="gap-1.5 text-[12px]"><Plus className="w-3.5 h-3.5" /> Add Segment</Button>
        </div>

        <Button onClick={save} disabled={saveMutation.isPending} className="w-full gap-2">
          <Save className="w-4 h-4" /> {saveMutation.isPending ? "Saving..." : "Save Spin Wheel"}
        </Button>
      </CardContent>
    </Card>
  );
}
