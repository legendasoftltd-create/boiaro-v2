import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Save, AlertTriangle, GripVertical, Eye, EyeOff, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";

interface Section {
  id: string; section_key: string; title: string; subtitle: string | null;
  is_enabled: boolean; sort_order: number; display_source: string | null;
}

export default function AdminHomepageSections() {
  const qc = useQueryClient();
  const [sections, setSections] = useState<Section[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLTableRowElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["homepage-sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("homepage_sections").select("*").order("sort_order");
      if (error) throw error;
      return data as Section[];
    },
  });

  useEffect(() => { if (data) setSections(data); }, [data]);

  const duplicates = useMemo(() => {
    const counts: Record<number, number> = {};
    sections.forEach(s => { counts[s.sort_order] = (counts[s.sort_order] || 0) + 1; });
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => Number(k)));
  }, [sections]);

  const autoFixOrder = () => {
    setSections(prev => prev.map((s, i) => ({ ...s, sort_order: i + 1 })));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const s of sections) {
        const { error } = await supabase.from("homepage_sections").update({
          title: s.title, subtitle: s.subtitle, is_enabled: s.is_enabled, sort_order: s.sort_order,
        }).eq("id", s.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["homepage-sections"] }); toast({ title: "Sections saved" }); },
  });

  const updateField = (idx: number, field: keyof Section, value: any) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const moveRow = (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    setSections(prev => {
      const updated = [...prev];
      [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
      return updated.map((s, i) => ({ ...s, sort_order: i + 1 }));
    });
  };

  const handleDragStart = (idx: number, e: React.DragEvent<HTMLTableRowElement>) => {
    setDragIdx(idx);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    });
  };

  const handleDragEnter = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) return;
    setOverIdx(idx);
    setSections(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIdx, 1);
      updated.splice(idx, 0, moved);
      setDragIdx(idx);
      return updated.map((s, i) => ({ ...s, sort_order: i + 1 }));
    });
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  };

  const formatKey = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-black">Homepage Sections</h1>
          
        </div>
        <div className="flex gap-2">
          {duplicates.size > 0 && (
            <Button variant="outline" size="sm" onClick={autoFixOrder} className="border-destructive/40 text-destructive">
              <AlertTriangle className="h-4 w-4 mr-1.5" />Fix Duplicates
            </Button>
          )}
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1.5" />{saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {duplicates.size > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Duplicate priority values detected. Click "Fix Duplicates" to auto-assign sequential order.
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border/50 bg-card/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 px-2" />
              <TableHead className="w-16 text-center">Order</TableHead>
              <TableHead className="w-[160px]">Section</TableHead>
              <TableHead className="min-w-[140px]">Title</TableHead>
              <TableHead className="min-w-[140px]">Subtitle</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
              <TableHead className="w-16 text-center">Visible</TableHead>
              <TableHead className="w-20 text-center">Move</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-black">Loading sections...</TableCell></TableRow>
            ) : sections.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-black">No sections found</TableCell></TableRow>
            ) : sections.map((s, i) => (
              <TableRow
                key={s.id}
                draggable
                onDragStart={e => handleDragStart(i, e)}
                onDragEnter={() => handleDragEnter(i)}
                onDragOver={e => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className={`group cursor-grab active:cursor-grabbing transition-colors ${
                  overIdx === i ? "bg-primary/5 border-primary/20" : ""
                } ${!s.is_enabled ? "opacity-50" : ""}`}
              >
                {/* Drag handle */}
                <TableCell className="px-2 py-2">
                  <GripVertical className="h-4 w-4 text-white group-hover:text-muted-foreground transition-colors" />
                </TableCell>

                {/* Order badge */}
                <TableCell className="py-2 text-center">
                  <span className={`inline-flex items-center justify-center h-6 w-6 rounded text-xs font-bold ${
                    duplicates.has(s.sort_order)
                      ? "bg-destructive/15 text-destructive border border-destructive/30"
                      : "bg-primary/10 text-primary border border-primary/20"
                  }`}>
                    {s.sort_order}
                  </span>
                </TableCell>

                {/* Section name */}
                <TableCell className="py-2">
                  <span className="font-medium text-sm truncate block ">{formatKey(s.section_key)}</span>
                </TableCell>

                {/* Editable title */}
                <TableCell className="py-2 pr-2">
                  <Input
                    value={s.title}
                    onChange={e => updateField(i, "title", e.target.value)}
                    placeholder="Section title"
                    className="h-7 text-xs border-border/40 bg-background/50 focus:bg-background"
                  />
                </TableCell>

                {/* Editable subtitle */}
                <TableCell className="py-2 pr-2">
                  <Input
                    value={s.subtitle || ""}
                    onChange={e => updateField(i, "subtitle", e.target.value || null)}
                    placeholder="Optional"
                    className="h-7 text-xs border-border/40 bg-background/50 focus:bg-background"
                  />
                </TableCell>

                {/* Status badge */}
                <TableCell className="py-2 text-center">
                  <Badge
                    variant={s.is_enabled ? "default" : "secondary"}
                    className={`text-[10px] px-2 py-0.5 ${
                      s.is_enabled
                        ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-muted text-muted-foreground border border-border/50"
                    }`}
                  >
                    {s.is_enabled ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>

                {/* Eye toggle */}
                <TableCell className="py-2 text-center">
                  <button
                    onClick={() => updateField(i, "is_enabled", !s.is_enabled)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
                    title={s.is_enabled ? "Hide section" : "Show section"}
                  >
                    {s.is_enabled ? (
                      <Eye className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </TableCell>

                {/* Reorder arrows */}
                <TableCell className="py-2 text-center">
                  <div className="inline-flex gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => moveRow(i, "up")}
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === sections.length - 1}
                      onClick={() => moveRow(i, "down")}
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer hint */}
      <p className="text-xs text-muted-foreground text-center">
        {sections.length} section{sections.length !== 1 ? "s" : ""} · Changes are saved when you click "Save Changes"
      </p>
    </div>
  );
}
