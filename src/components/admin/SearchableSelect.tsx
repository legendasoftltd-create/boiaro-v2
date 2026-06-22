import { useState, useMemo, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableSelectOption {
  id: string;
  label: string;
  /** Extra searchable text (e.g. Bangla name) */
  searchAlt?: string;
  /** Group header this item belongs to */
  group?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Enable multi-select mode — pass `values`/`onChangeValues` instead of `value`/`onChange`. */
  multiple?: false;
}

interface MultiSearchableSelectProps {
  options: SearchableSelectOption[];
  values: string[];
  onChangeValues: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  multiple: true;
}

export function SearchableSelect(props: SearchableSelectProps | MultiSearchableSelectProps) {
  const {
    options,
    placeholder = "Select...",
    searchPlaceholder = "Search...",
    emptyText = "No results found",
  } = props;
  const multiple = props.multiple === true;
  const value = multiple ? "" : (props as SearchableSelectProps).value;
  const values = multiple ? (props as MultiSearchableSelectProps).values : [];

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  const isSelected = (id: string) => (multiple ? values.includes(id) : value === id);

  const handleSelect = (id: string) => {
    if (multiple) {
      const next = values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
      (props as MultiSearchableSelectProps).onChangeValues(next);
    } else {
      (props as SearchableSelectProps).onChange(id);
      setOpen(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.searchAlt || "").toLowerCase().includes(q)
    );
  }, [options, search]);

  const hasGroups = options.some((o) => o.group);

  const grouped = useMemo(() => {
    if (!hasGroups) return null;
    const groups: Record<string, SearchableSelectOption[]> = {};
    filtered.forEach((o) => {
      const g = o.group || "";
      if (!groups[g]) groups[g] = [];
      groups[g].push(o);
    });
    return Object.entries(groups);
  }, [filtered, hasGroups]);

  const triggerLabel = useMemo(() => {
    if (multiple) {
      const labels = values.map((id) => options.find((o) => o.id === id)?.label).filter(Boolean) as string[];
      return labels.length > 0 ? labels.join(", ") : null;
    }
    return options.find((o) => o.id === value)?.label || null;
  }, [options, value, values, multiple]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10"
        >
          <span className={cn("truncate", !triggerLabel && "text-muted-foreground")}>
            {triggerLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* Sticky search */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
          />
        </div>
        {/* Scrollable list */}
        <div className="max-h-[260px] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
          )}
          {grouped
            ? grouped.map(([group, items]) => (
                <div key={group}>
                  {group && (
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0 z-10">
                      {group}
                    </div>
                  )}
                  {items.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => handleSelect(o.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                        isSelected(o.id) && "bg-accent"
                      )}
                    >
                      <Check className={cn("h-4 w-4 shrink-0", isSelected(o.id) ? "opacity-100" : "opacity-0")} />
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
              ))
            : filtered.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleSelect(o.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                    isSelected(o.id) && "bg-accent"
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0", isSelected(o.id) ? "opacity-100" : "opacity-0")} />
                  <span>{o.label}</span>
                </button>
              ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
