import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

const SEGMENT_COLORS = ["#d9a626", "#8a6d1f", "#c9922e", "#6d5416", "#e8b93f", "#7a5f1a"];

export function SpinWheel() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.gamification.spinWheelStatus.useQuery();
  const spinMutation = trpc.gamification.spinWheel.useMutation();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

  if (!status?.available) return null;

  const segments = status.segments as { label: string; coin_reward: number; weight: number }[];
  const sliceAngle = 360 / segments.length;

  const handleSpin = async () => {
    if (spinning || !status.canSpin) return;
    setSpinning(true);
    try {
      const result = await spinMutation.mutateAsync();
      if (!result?.success || result.segmentIndex === undefined) {
        toast.info(result?.reason === "daily_limit_reached" ? "আজকের স্পিন শেষ!" : "স্পিন করা যায়নি");
        setSpinning(false);
        return;
      }
      // Land the pointer (fixed at top) on the winning slice: several full
      // spins for effect, plus the offset to bring that slice under the
      // pointer, centered within the slice rather than at its edge.
      const targetAngle = 360 * 5 - (result.segmentIndex * sliceAngle + sliceAngle / 2);
      setRotation((prev) => prev + targetAngle + (360 - (prev % 360)));

      setTimeout(() => {
        toast.success(result.segment.coin_reward > 0 ? `🎉 ${result.segment.label}!` : `${result.segment.label}`);
        utils.gamification.spinWheelStatus.invalidate();
        setSpinning(false);
      }, 4000);
    } catch {
      toast.error("স্পিন ব্যর্থ হয়েছে");
      setSpinning(false);
    }
  };

  return (
    <Card className="border-border/30 mb-6">
      <CardHeader>
        <CardTitle className="text-base font-serif flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> লাকি স্পিন</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="relative w-56 h-56">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-primary" />
          <div
            ref={wheelRef}
            className="w-56 h-56 rounded-full border-4 border-primary/40 relative overflow-hidden transition-transform ease-out"
            style={{
              transform: `rotate(${rotation}deg)`,
              transitionDuration: spinning ? "4s" : "0s",
              background: `conic-gradient(${segments.map((_, i) => `${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} ${i * sliceAngle}deg ${(i + 1) * sliceAngle}deg`).join(", ")})`,
            }}
          >
            {segments.map((seg, i) => (
              <div
                key={i}
                className="absolute top-1/2 left-1/2 text-[10px] font-semibold text-white"
                style={{
                  transform: `rotate(${i * sliceAngle + sliceAngle / 2}deg) translate(0, -70px) rotate(90deg)`,
                  transformOrigin: "0 0",
                  width: "70px",
                  textAlign: "center",
                }}
              >
                {seg.label}
              </div>
            ))}
          </div>
        </div>

        <Button onClick={handleSpin} disabled={spinning || !status.canSpin} className="w-full h-12">
          {spinning ? "ঘুরছে..." : status.canSpin ? "স্পিন করুন" : `আজকের স্পিন শেষ (${status.spinsToday}/${status.spinsPerDay})`}
        </Button>
      </CardContent>
    </Card>
  );
}
