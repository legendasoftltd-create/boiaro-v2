import { Link } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Radio, Lock, Share2 } from "lucide-react"
import type { OnAirShow } from "@/hooks/useOnAirShowPlayer"

/** "1h 18m" / "42m" — the format requirement 5's example card uses. */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  // Anything under a minute would otherwise round to a bare "0m", which reads
  // as "no audio" rather than "very short clip".
  return m > 0 ? `${m}m` : `${seconds}s`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * "04 Sep 2026" — built from parts rather than toLocaleDateString, because
 * en-GB renders September as "Sept" (four letters), which makes the card's
 * date column jump width against every other month.
 */
export function formatShowDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function ShowCard({
  show,
  isPlaying,
  onPlay,
  onShare,
}: {
  show: OnAirShow
  isPlaying: boolean
  onPlay: () => void
  onShare?: () => void
}) {
  const meta = [formatShowDate(show.published_at ?? show.recorded_at), formatDuration(show.duration_seconds)]
    .filter(Boolean)
    .join(" • ")
  // A premium show a non-subscriber is looking at still shows on the card —
  // it just can't be played, and points at the plans page instead.
  const locked = show.locked || !show.audio_url

  return (
    <Card className="border-border/30 hover:border-border/60 transition-colors">
      <CardContent className="p-3 flex items-center gap-3">
        {show.cover_image_url ? (
          <img src={show.cover_image_url} alt="" loading="lazy" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border/40" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{show.title}</p>
          {show.episode_title && <p className="text-xs text-muted-foreground truncate">{show.episode_title}</p>}
          <p className="text-xs text-muted-foreground truncate">
            <Link to={`/host/${show.rj_user_id}`} className="hover:text-foreground hover:underline">
              {show.rj_stage_name || "RJ"}
            </Link>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{meta}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {show.visibility === "premium" && (
            <Badge variant="outline" className="text-[10px] gap-1 hidden sm:flex"><Lock className="w-2.5 h-2.5" /> প্রিমিয়াম</Badge>
          )}
          {onShare && (
            <Button size="icon" variant="ghost" className="text-muted-foreground" onClick={onShare} aria-label="শেয়ার করুন">
              <Share2 className="w-4 h-4" />
            </Button>
          )}
          {locked ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
              <Link to="/subscriptions"><Lock className="w-3.5 h-3.5" /> সাবস্ক্রাইব</Link>
            </Button>
          ) : (
            <Button size="icon" className="w-11 h-11 rounded-full" onClick={onPlay} aria-label={isPlaying ? "থামান" : "শুনুন"}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
