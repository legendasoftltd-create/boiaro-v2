import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { List } from "lucide-react";

interface TocItem {
  id?: string;
  label?: string;
  title?: string;
  href?: string;
  subitems?: TocItem[];
}

interface TocSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: TocItem[];
  currentHref?: string;
  fileType: "pdf" | "epub";
  totalPages?: number;
  currentPage?: number;
  onSelectItem: (item: TocItem) => void;
  onGoToPage?: (page: number) => void;
}

export function TocSheet({
  open, onOpenChange, items, currentHref, fileType,
  totalPages, currentPage, onSelectItem, onGoToPage,
}: TocSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 bg-background border-border">
        <SheetHeader>
          <SheetTitle className="text-foreground font-serif flex items-center gap-2">
            <List className="w-5 h-5" />
            {fileType === "pdf" ? "Go to Page" : "Table of Contents"}
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-6rem)] mt-4">
          {fileType === "pdf" && totalPages ? (
            <div className="space-y-1 pr-4">
              {/* Page jump input */}
              <div className="flex items-center gap-2 mb-4 px-3">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  defaultValue={currentPage}
                  className="w-20 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseInt((e.target as HTMLInputElement).value);
                      if (val >= 1 && val <= totalPages && onGoToPage) {
                        onGoToPage(val);
                        onOpenChange(false);
                      }
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">/ {totalPages}</span>
              </div>
              {/* Quick jump buttons */}
              <div className="grid grid-cols-5 gap-1 px-3">
                {Array.from({ length: Math.min(totalPages, 50) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => { onGoToPage?.(p); onOpenChange(false); }}
                      className={`text-xs py-2 rounded-md transition-colors ${
                        p === currentPage
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-primary/10"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                {totalPages > 50 && (
                  <span className="text-xs text-muted-foreground col-span-5 text-center py-2">
                    Use input above for pages &gt; 50
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1 pr-4">
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground px-3 py-4">No table of contents available.</p>
              )}
              {items.map((item, i) => (
                <button
                  key={item.id || item.href || i}
                  onClick={() => { onSelectItem(item); onOpenChange(false); }}
                  className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                    currentHref && item.href && currentHref.includes(item.href)
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-primary/5"
                  }`}
                >
                  <p className="text-sm font-medium">{item.label || item.title || `Chapter ${i + 1}`}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
