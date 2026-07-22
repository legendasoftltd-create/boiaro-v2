import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

interface SectionSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Compact per-section search box — sits in a section's header, before its scroll arrows. */
export function SectionSearch({ value, onChange, placeholder = "Search..." }: SectionSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-32 md:w-40 pl-8 pr-7 text-xs bg-secondary/60 border-border/40 rounded-full focus-visible:ring-1"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
