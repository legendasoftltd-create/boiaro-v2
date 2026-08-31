import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Mic2, AlertTriangle } from "lucide-react"
import type { useVoiceProcessor } from "@/hooks/useVoiceProcessor"

// §14 Mixer voice chain controls — gate/EQ/gain/compressor on the RJ's own
// mic, plus a live level meter. The limiter downstream is always-on safety,
// not exposed as a control. Only meaningful for whoever's mic this actually
// is (the host/co-host using their own local voice processor instance) —
// there's nothing here for a moderator to control on someone else's audio.
export function StudioVoicePanel({ voiceProcessor }: { voiceProcessor: ReturnType<typeof useVoiceProcessor> }) {
  const { settings, gateActive, peakLevel, isOverloaded, micMode, setMicMode } = voiceProcessor

  return (
    <Card className="border-primary/20">
      <CardContent className="p-3 space-y-3">
        {/* Mic mode decides the capture constraints, and it matters most on a
            phone: with echo cancellation on, the browser switches to its
            voice-call audio path and cancels the music bed and the caller's
            voice as if they were echo. Headphones lets us turn it off. */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium">মাইক মোড</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setMicMode("headphones")}
              className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                micMode === "headphones"
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:bg-secondary/50"
              }`}
            >
              <span className="block text-[11px] font-medium">🎧 হেডফোন</span>
              <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">
                সেরা সাউন্ড — মিউজিক ও কলার ঠিক শোনা যাবে
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMicMode("speaker")}
              className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                micMode === "speaker"
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:bg-secondary/50"
              }`}
            >
              <span className="block text-[11px] font-medium">🔊 স্পিকার</span>
              <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">
                ইকো বন্ধ থাকবে, তবে সাউন্ড কিছুটা কমে যাবে
              </span>
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            মোবাইল থেকে শো করলে হেডফোন ব্যবহার করুন — তাহলে মিউজিক আর কলারের কথা
            পরিষ্কার শোনা যাবে। মোড বদলালে মাইক আবার চালু করতে হবে।
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Mic2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium flex-1">Voice Processing</span>
          {!gateActive && <Badge variant="outline" className="text-[9px]">gate unavailable in this browser</Badge>}
        </div>

        {/* Level meter */}
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] ${isOverloaded ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${Math.min(100, Math.round(peakLevel * 100))}%` }}
            />
          </div>
          {isOverloaded && (
            <p className="text-[10px] text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Overload — lower your gain or move back from the mic</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Row label="Noise gate" value={`${settings.gateThresholdDb} dB`}>
            <Slider value={[settings.gateThresholdDb]} onValueChange={([v]) => voiceProcessor.setGateThresholdDb(v)} min={-80} max={0} step={1} disabled={!gateActive} />
          </Row>
          <Row label="EQ Low" value={`${settings.eqLowGainDb} dB`}>
            <Slider value={[settings.eqLowGainDb]} onValueChange={([v]) => voiceProcessor.setEqLowGainDb(v)} min={-15} max={15} step={1} />
          </Row>
          <Row label="EQ Mid" value={`${settings.eqMidGainDb} dB`}>
            <Slider value={[settings.eqMidGainDb]} onValueChange={([v]) => voiceProcessor.setEqMidGainDb(v)} min={-15} max={15} step={1} />
          </Row>
          <Row label="EQ High" value={`${settings.eqHighGainDb} dB`}>
            <Slider value={[settings.eqHighGainDb]} onValueChange={([v]) => voiceProcessor.setEqHighGainDb(v)} min={-15} max={15} step={1} />
          </Row>
          <Row label="Gain" value={`${settings.gainDb} dB`}>
            <Slider value={[settings.gainDb]} onValueChange={([v]) => voiceProcessor.setGainDb(v)} min={-12} max={12} step={1} />
          </Row>
          <Row label="Compressor threshold" value={`${settings.compThresholdDb} dB`}>
            <Slider value={[settings.compThresholdDb]} onValueChange={([v]) => voiceProcessor.setCompThresholdDb(v)} min={-60} max={0} step={1} />
          </Row>
          <Row label="Compressor ratio" value={`${settings.compRatio}:1`}>
            <Slider value={[settings.compRatio]} onValueChange={([v]) => voiceProcessor.setCompRatio(v)} min={1} max={12} step={0.5} />
          </Row>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  )
}
