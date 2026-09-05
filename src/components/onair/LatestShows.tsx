import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Headphones, ChevronRight } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { useOnAirShowPlayer, type OnAirShow } from "@/hooks/useOnAirShowPlayer"
import { ShowCard } from "@/components/onair/ShowCard"
import { toast } from "sonner"

/**
 * "Latest Shows / সম্প্রতি প্রচারিত" — the newest 3–5 published recordings,
 * with a View All into the full archive (requirement 5).
 *
 * Renders nothing at all when there's nothing published: an empty section
 * header above blank space reads as a broken page, and the section only exists
 * once admins have actually released a show.
 */
export function LatestShows({ limit = 5 }: { limit?: number }) {
  const { data: shows = [], isLoading } = trpc.rj.onAir.latestShows.useQuery({ limit })
  const { play, isShowPlaying } = useOnAirShowPlayer()

  const share = async (show: OnAirShow) => {
    const url = `${window.location.origin}/shows/${show.id}`
    if (navigator.share) {
      try { await navigator.share({ title: show.title, url }); return } catch { /* cancelled — fall through to copy */ }
    }
    await navigator.clipboard.writeText(url)
    toast.success("লিংক কপি হয়েছে")
  }

  if (isLoading || !shows.length) return null

  return (
    <section data-section="onair_latest_shows" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-serif font-bold">সম্প্রতি প্রচারিত</h2>
            <p className="text-xs text-muted-foreground">Latest Shows — যেকোনো সময় আবার শুনুন</p>
          </div>
        </div>
        <Button asChild size="sm" variant="ghost" className="gap-1 text-xs shrink-0">
          <Link to="/shows">সব অনুষ্ঠান <ChevronRight className="w-3.5 h-3.5" /></Link>
        </Button>
      </div>

      <div className="space-y-2">
        {(shows as OnAirShow[]).map((show) => (
          <ShowCard
            key={show.id}
            show={show}
            isPlaying={isShowPlaying(show.id)}
            onPlay={() => play(show)}
            onShare={() => share(show)}
          />
        ))}
      </div>

      <Button asChild variant="outline" className="w-full gap-1.5">
        <Link to="/shows">View All / সব অনুষ্ঠান <ChevronRight className="w-4 h-4" /></Link>
      </Button>
    </section>
  )
}
