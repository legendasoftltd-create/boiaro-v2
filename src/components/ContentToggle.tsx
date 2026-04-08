import { BookOpen, Headphones, Layers, Package } from "lucide-react"

type ContentType = "all" | "ebook" | "audiobook" | "hardcopy"

interface ContentToggleProps {
  value: ContentType
  onChange: (value: ContentType) => void
}

export function ContentToggle({ value, onChange }: ContentToggleProps) {
  const items: { key: ContentType; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Layers },
    { key: "ebook", label: "eBooks", icon: BookOpen },
    { key: "audiobook", label: "Audio", icon: Headphones },
    { key: "hardcopy", label: "Print", icon: Package },
  ]

  return (
    <div className="inline-flex items-center gap-0.5 p-1 bg-secondary/60 rounded-full border border-border/40 overflow-x-auto">
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 px-3 md:px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
            value === key ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="w-3 h-3" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
