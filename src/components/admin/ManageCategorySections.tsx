import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowUp, ArrowDown, Trash2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

interface CategorySectionRow {
  id?: string;
  category_id: string;
  title: string;
  subtitle: string;
  book_limit: number;
  sort_order: number;
}

interface ManageCategorySectionsProps {
  open: boolean;
  onClose: () => void;
}

export function ManageCategorySections({ open, onClose }: ManageCategorySectionsProps) {
  const utils = trpc.useUtils();
  const { data: categories } = trpc.admin.listCategories.useQuery();
  const { data: existing, isLoading } = trpc.admin.getHomepageCategorySections.useQuery(undefined, { enabled: open });
  const saveMutation = trpc.admin.saveHomepageCategorySections.useMutation({
    onSuccess: () => {
      utils.admin.getHomepageCategorySections.invalidate();
      toast.success("Category sections saved");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const [rows, setRows] = useState<CategorySectionRow[]>([]);

  useEffect(() => {
    if (existing) {
      setRows(existing.map((r: any) => ({
        id: r.id,
        category_id: r.category_id,
        title: r.title ?? "",
        subtitle: r.subtitle ?? "",
        book_limit: r.book_limit ?? 8,
        sort_order: r.sort_order,
      })));
    }
  }, [existing]);

  const addRow = () => {
    setRows(prev => [...prev, {
      category_id: "",
      title: "",
      subtitle: "",
      book_limit: 8,
      sort_order: prev.length + 1,
    }]);
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sort_order: i + 1 })));
  };

  const moveRow = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= rows.length) return;
    setRows(prev => {
      const updated = [...prev];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      return updated.map((r, i) => ({ ...r, sort_order: i + 1 }));
    });
  };

  const updateRow = (idx: number, field: keyof CategorySectionRow, value: any) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSave = () => {
    if (rows.some(r => !r.category_id)) {
      toast.error("All rows must have a category selected");
      return;
    }
    saveMutation.mutate(rows.map(r => ({
      id: r.id,
      category_id: r.category_id,
      title: r.title || null,
      subtitle: r.subtitle || null,
      book_limit: r.book_limit,
      sort_order: r.sort_order,
    })));
  };

  const getCategoryLabel = (cat: any) => cat.name_bn || cat.name_en || cat.name;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Manage Homepage Category Sections
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="space-y-3 py-2">
            {rows.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No category sections yet. Add one below.</p>
            )}

            {rows.map((row, idx) => (
              <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border border-border/40 bg-secondary/30">
                <span className="text-xs font-bold text-muted-foreground w-5 pt-2.5 shrink-0">#{idx + 1}</span>

                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px] text-muted-foreground mb-1 block">Category</Label>
                    <Select value={row.category_id} onValueChange={v => updateRow(idx, "category_id", v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(categories || []).map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.id} className="text-xs">
                            {getCategoryLabel(cat)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">Custom Title (optional)</Label>
                    <Input
                      value={row.title}
                      onChange={e => updateRow(idx, "title", e.target.value)}
                      placeholder="Leave blank for category name"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">Subtitle (optional)</Label>
                    <Input
                      value={row.subtitle}
                      onChange={e => updateRow(idx, "subtitle", e.target.value)}
                      placeholder="Optional subtitle"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">Book Limit (default 8)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={row.book_limit}
                      onChange={e => updateRow(idx, "book_limit", Number(e.target.value))}
                      className="h-8 text-xs w-20"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-0.5 shrink-0 pt-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => moveRow(idx, "up")}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === rows.length - 1} onClick={() => moveRow(idx, "down")}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeRow(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed">
              <Plus className="h-4 w-4 mr-1.5" /> Add Category Section
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1.5" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1.5" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
