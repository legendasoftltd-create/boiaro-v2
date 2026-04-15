import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DollarSign, Save, BookOpen, Headphones } from "lucide-react";
import { toast } from "sonner";

interface BookRevenueSplitProps {
  bookId: string;
}

interface SplitState {
  useDefault: boolean;
  writer_percentage: number;
  publisher_percentage: number;
  narrator_percentage: number;
  platform_percentage: number;
  fulfillment_cost_percentage: number;
  id?: string;
}

const FORMAT_CONFIG = [
  {
    format: "ebook",
    label: "eBook",
    icon: BookOpen,
    fields: ["writer_percentage", "publisher_percentage", "platform_percentage"],
    labels: { writer_percentage: "Writer", publisher_percentage: "Publisher", platform_percentage: "BoiAro Platform" },
  },
  {
    format: "audiobook",
    label: "Audiobook",
    icon: Headphones,
    fields: ["writer_percentage", "publisher_percentage", "narrator_percentage", "platform_percentage"],
    labels: { writer_percentage: "Writer", publisher_percentage: "Publisher", narrator_percentage: "Narrator", platform_percentage: "BoiAro Platform" },
  },
];

export function BookRevenueSplit({ bookId }: BookRevenueSplitProps) {
  const [defaults, setDefaults] = useState<Record<string, any>>({});
  const [splits, setSplits] = useState<Record<string, SplitState>>({
    ebook: { useDefault: true, writer_percentage: 65, publisher_percentage: 0, narrator_percentage: 0, platform_percentage: 35, fulfillment_cost_percentage: 0 },
    audiobook: { useDefault: true, writer_percentage: 0, publisher_percentage: 0, narrator_percentage: 60, platform_percentage: 40, fulfillment_cost_percentage: 0 },
  });
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { load(); }, [bookId]);

  const load = async () => {
    const [d, s] = await Promise.all([
      supabase.from("default_revenue_rules").select("*"),
      supabase.from("format_revenue_splits").select("*").eq("book_id", bookId),
    ]);

    const defaultMap: Record<string, any> = {};
    (d.data || []).forEach(r => { defaultMap[r.format] = r; });
    setDefaults(defaultMap);

    const newSplits: Record<string, SplitState> = {};
    ["ebook", "audiobook"].forEach(format => {
      const override = (s.data || []).find(r => r.format === format);
      const def = defaultMap[format] || {};
      if (override) {
        newSplits[format] = {
          useDefault: false, id: override.id,
          writer_percentage: override.writer_percentage,
          publisher_percentage: override.publisher_percentage,
          narrator_percentage: override.narrator_percentage,
          platform_percentage: override.platform_percentage,
          fulfillment_cost_percentage: override.fulfillment_cost_percentage || 0,
        };
      } else {
        newSplits[format] = {
          useDefault: true,
          writer_percentage: def.writer_percentage || 0,
          publisher_percentage: def.publisher_percentage || 0,
          narrator_percentage: def.narrator_percentage || 0,
          platform_percentage: def.platform_percentage || 0,
          fulfillment_cost_percentage: def.fulfillment_cost_percentage || 0,
        };
      }
    });
    setSplits(newSplits);
  };

  const toggleDefault = (format: string, useDefault: boolean) => {
    if (useDefault) {
      const def = defaults[format] || {};
      setSplits(prev => ({
        ...prev, [format]: {
          ...prev[format], useDefault: true,
          writer_percentage: def.writer_percentage || 0,
          publisher_percentage: def.publisher_percentage || 0,
          narrator_percentage: def.narrator_percentage || 0,
          platform_percentage: def.platform_percentage || 0,
          fulfillment_cost_percentage: def.fulfillment_cost_percentage || 0,
        }
      }));
    } else {
      setSplits(prev => ({ ...prev, [format]: { ...prev[format], useDefault: false } }));
    }
  };

  const updateField = (format: string, field: string, value: number) => {
    setSplits(prev => ({ ...prev, [format]: { ...prev[format], [field]: value } }));
  };

  const getTotal = (split: SplitState) =>
    split.writer_percentage + split.publisher_percentage + split.narrator_percentage +
    split.platform_percentage + split.fulfillment_cost_percentage;

  const saveSplit = async (format: string) => {
    const split = splits[format];
    const total = getTotal(split);
    if (Math.abs(total - 100) > 0.01) { toast.error(`Total must be 100% (currently ${total}%)`); return; }

    setSaving(format);
    if (split.useDefault) {
      if (split.id) {
        await supabase.from("format_revenue_splits").delete().eq("id", split.id);
      }
      toast.success(`${format} using default rules`);
    } else {
      const payload = {
        book_id: bookId, format,
        writer_percentage: split.writer_percentage,
        publisher_percentage: split.publisher_percentage,
        narrator_percentage: split.narrator_percentage,
        platform_percentage: split.platform_percentage,
        fulfillment_cost_percentage: split.fulfillment_cost_percentage,
      };
      const { error } = await supabase.from("format_revenue_splits").upsert(payload, { onConflict: "book_id,format" });
      if (error) { toast.error(error.message); setSaving(null); return; }
      toast.success(`${format} revenue split saved`);
    }
    setSaving(null);
    load();
  };

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-400" /> Creator Revenue Split</CardTitle>
        <p className="text-[10px] text-white">Royalty distribution for digital formats. Hard Copy uses a separate commerce model below.</p>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          {FORMAT_CONFIG.map(({ format, label, icon: Icon, fields, labels }) => {
            const split = splits[format];
            if (!split) return null;
            const total = getTotal(split);
            return (
              <div key={format} className="p-3 rounded-lg border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {label}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Use Default</span>
                    <Switch checked={split.useDefault} onCheckedChange={(v) => toggleDefault(format, v)} />
                  </div>
                </div>
                {fields.map(field => (
                  <div key={field} className="flex items-center gap-2">
                    <Label className="text-xs w-24">{(labels as any)[field]}</Label>
                    <Input type="number" min={0} max={100} className="h-7 w-16 text-xs"
                      value={(split as any)[field]} disabled={split.useDefault}
                      onChange={(e) => updateField(format, field, Number(e.target.value))} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                ))}
                <div className={`text-[10px] font-medium ${Math.abs(total - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                  Total: {total}%{split.useDefault && " (default)"}
                </div>
                {!split.useDefault && (
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => saveSplit(format)}
                    disabled={saving === format || Math.abs(total - 100) > 0.01}>
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
