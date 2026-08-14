import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { SiteImageUpload } from "@/components/admin/SiteImageUpload"
import { trpc } from "@/lib/trpc"

export interface BroadcastSettingsValue {
  showTitle: string
  category: string
  description: string
  coverImageUrl: string
  chatEnabled: boolean
  requestsEnabled: boolean
  recordingEnabled: boolean
  callinEnabled: boolean
}

export const DEFAULT_BROADCAST_SETTINGS: BroadcastSettingsValue = {
  showTitle: "", category: "", description: "", coverImageUrl: "",
  chatEnabled: true, requestsEnabled: true, recordingEnabled: true, callinEnabled: false,
}

interface BroadcastSettingsFormProps {
  value: BroadcastSettingsValue
  onChange: (value: BroadcastSettingsValue) => void
  disabled?: boolean
}

/**
 * Shared "what is this show" + toggles form used by both Go Live paths
 * (external-encoder in RjDashboard.tsx, browser Studio in StudioRoom.tsx) —
 * every field here maps directly to a LiveSession column the start mutation
 * already accepts on both flows.
 */
export function BroadcastSettingsForm({ value, onChange, disabled }: BroadcastSettingsFormProps) {
  const set = <K extends keyof BroadcastSettingsValue>(key: K, v: BroadcastSettingsValue[K]) =>
    onChange({ ...value, [key]: v })

  // The call-in toggle only makes sense to offer if Admin has the platform-
  // wide switch on (Admin → Radio Safety & Controls) — the start mutation
  // rejects callinEnabled:true otherwise, so surfacing a toggle that would
  // just error is worse than explaining why it's off.
  const { data: callin } = trpc.rj.callinAvailable.useQuery()
  const callinAllowed = !!callin?.enabled

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Program Title</Label>
          <Input
            value={value.showTitle}
            onChange={(e) => set("showTitle", e.target.value)}
            placeholder="Evening Poetry Reading"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Input
            value={value.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="Music, Talk, News..."
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Short Description</Label>
        <Textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What's this show about?"
          rows={2}
          disabled={disabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Program Cover</Label>
        <SiteImageUpload
          value={value.coverImageUrl}
          onChange={(url) => set("coverImageUrl", url)}
          fieldKey="program-cover"
        />
      </div>

      <div className="space-y-2.5 pt-1">
        <ToggleRow label="Chat" checked={value.chatEnabled} onCheckedChange={(v) => set("chatEnabled", v)} disabled={disabled} />
        <ToggleRow label="Song/Topic Requests" checked={value.requestsEnabled} onCheckedChange={(v) => set("requestsEnabled", v)} disabled={disabled} />
        <ToggleRow label="Recording" checked={value.recordingEnabled} onCheckedChange={(v) => set("recordingEnabled", v)} disabled={disabled} />
        <ToggleRow
          label="Call-in"
          checked={value.callinEnabled && callinAllowed}
          onCheckedChange={(v) => set("callinEnabled", v)}
          disabled={disabled || !callinAllowed}
          note={!callinAllowed ? "Call-in is turned off platform-wide by Admin — ask them to enable it in Radio Safety & Controls" : undefined}
        />
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, onCheckedChange, disabled, note }: {
  label: string; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; note?: string
}) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {note && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-xs">{note}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}
