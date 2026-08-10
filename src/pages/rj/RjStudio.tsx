import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, Plus, Copy, Radio } from "lucide-react"
import { toast } from "sonner"
import {
  useMyStudioSessions,
  useCreateStudioSession,
  useGenerateInviteLink,
  type StudioSession,
} from "@/hooks/useStudioSession"

const STATUS_LABEL: Record<StudioSession["status"], string> = {
  scheduled: "প্রস্তুত",
  live: "লাইভ",
  ended: "শেষ হয়েছে",
}

const ROLE_LABEL: Record<string, string> = {
  co_host: "Co-host",
  producer: "Producer",
  rj: "RJ",
  guest: "Guest",
}

export default function RjStudio() {
  const navigate = useNavigate()
  const { sessions, loading, refetch } = useMyStudioSessions()
  const { createSession, isCreating } = useCreateStudioSession()

  const handleCreate = async () => {
    try {
      const session = await createSession()
      toast.success("নতুন Studio সেশন তৈরি হয়েছে")
      navigate(`/studio/${session.id}`)
    } catch (err: any) {
      toast.error(err.message || "সেশন তৈরি করা যায়নি")
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">BoiAro Studio</h1>
          <p className="text-muted-foreground text-sm">একাধিক RJ/Guest নিয়ে লাইভ স্টুডিও শুরু করুন</p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          নতুন সেশন
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : sessions.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          এখনো কোনো Studio সেশন নেই — "নতুন সেশন" চেপে শুরু করুন।
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onOpen={() => navigate(`/studio/${s.id}`)} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({ session, onOpen, onChanged }: { session: StudioSession; onOpen: () => void; onChanged: () => void }) {
  const { generate, isGenerating } = useGenerateInviteLink(session.id)
  const [lastInvite, setLastInvite] = useState<{ role: string; url: string } | null>(null)

  const handleInvite = async (role: "co_host" | "producer" | "rj" | "guest") => {
    try {
      const { token } = await generate(role)
      const url = `${window.location.origin}/studio/join/${token}`
      setLastInvite({ role, url })
      await navigator.clipboard.writeText(url).catch(() => null)
      toast.success(`${ROLE_LABEL[role]} invite link কপি হয়েছে`)
      onChanged()
    } catch (err: any) {
      toast.error(err.message || "Invite link তৈরি করা যায়নি")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Radio className="w-4 h-4" /> {session.room_name}
          </span>
          <Badge variant={session.status === "live" ? "destructive" : "outline"}>
            {STATUS_LABEL[session.status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["co_host", "producer", "rj", "guest"] as const).map((role) => (
            <Button key={role} size="sm" variant="outline" disabled={isGenerating} onClick={() => handleInvite(role)} className="gap-1.5">
              <Copy className="w-3.5 h-3.5" /> {ROLE_LABEL[role]} invite
            </Button>
          ))}
        </div>
        {lastInvite && (
          <p className="text-xs text-muted-foreground break-all bg-muted/50 rounded-lg p-2">
            {ROLE_LABEL[lastInvite.role]}: {lastInvite.url}
          </p>
        )}
        <Button size="sm" onClick={onOpen} className="gap-1.5">
          <Users className="w-3.5 h-3.5" /> Studio Room খুলুন
        </Button>
      </CardContent>
    </Card>
  )
}
