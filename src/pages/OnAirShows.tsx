import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams, Link } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/contexts/AuthContext"
import { trpc } from "@/lib/trpc"
import { useOnAirShowPlayer, type OnAirShow } from "@/hooks/useOnAirShowPlayer"
import { ShowCard } from "@/components/onair/ShowCard"
import { Headphones, Radio, History, ChevronLeft } from "lucide-react"
import { toast } from "sonner"

/**
 * "আগের অনুষ্ঠান" — the full published-show archive behind View All.
 *
 * Deliberately not called "Recordings" anywhere a listener can see it
 * (requirement 6): that word describes the admin's raw files, not a programme
 * someone wants to listen to.
 */
export default function OnAirShows() {
  const { showId } = useParams<{ showId?: string }>()
  return showId ? <SingleShow showId={showId} /> : <ShowArchive />
}

function useShareShow() {
  return async (show: OnAirShow) => {
    const url = `${window.location.origin}/shows/${show.id}`
    if (navigator.share) {
      try { await navigator.share({ title: show.title, url }); return } catch { /* cancelled — fall through to copy */ }
    }
    await navigator.clipboard.writeText(url)
    toast.success("লিংক কপি হয়েছে")
  }
}

function ShowArchive() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<"browse" | "history">("browse")

  const showFilter = searchParams.get("show") ?? "all"
  const rjFilter = searchParams.get("rj") ?? "all"
  const sort = (searchParams.get("sort") as "latest" | "oldest") ?? "latest"

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === "all" || (key === "sort" && value === "latest")) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    document.title = "আগের অনুষ্ঠান — BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [])

  const { data: filters } = trpc.rj.onAir.filters.useQuery()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = trpc.rj.onAir.shows.useInfiniteQuery(
    {
      limit: 20,
      sort,
      ...(showFilter !== "all" ? { showScheduleId: showFilter } : {}),
      ...(rjFilter !== "all" ? { rjUserId: rjFilter } : {}),
    },
    { getNextPageParam: (last: any) => last.nextCursor ?? undefined }
  )
  const { data: history = [], isLoading: historyLoading } = trpc.rj.onAir.myShowHistory.useQuery(undefined, {
    enabled: !!user && tab === "history",
  })

  const shows = useMemo(() => (data?.pages ?? []).flatMap((p: any) => p.shows) as OnAirShow[], [data])
  const { play, isShowPlaying } = useOnAirShowPlayer()
  const share = useShareShow()

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2 mb-2 text-xs text-muted-foreground">
          <Link to="/on-air"><ChevronLeft className="w-3.5 h-3.5" /> On Air</Link>
        </Button>

        <h1 className="text-2xl font-serif font-bold flex items-center gap-2 mb-1">
          <Headphones className="w-6 h-6 text-primary" /> আগের অনুষ্ঠান
        </h1>
        <p className="text-muted-foreground text-sm mb-4">প্রচারিত সব শো — যেকোনো সময় আবার শুনুন</p>

        {user && (
          <div className="flex gap-2 mb-4">
            <Button size="sm" variant={tab === "browse" ? "default" : "outline"} className="text-xs" onClick={() => setTab("browse")}>
              সব অনুষ্ঠান
            </Button>
            <Button size="sm" variant={tab === "history" ? "default" : "outline"} className="text-xs gap-1.5" onClick={() => setTab("history")}>
              <History className="w-3.5 h-3.5" /> আমার শোনা
            </Button>
          </div>
        )}

        {tab === "browse" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              <Select value={showFilter} onValueChange={(v) => setParam("show", v)}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="সব অনুষ্ঠান" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সব অনুষ্ঠান</SelectItem>
                  {(filters?.shows ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={rjFilter} onValueChange={(v) => setParam("rj", v)}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="সব RJ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সব RJ</SelectItem>
                  {(filters?.rjs ?? []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(v) => setParam("sort", v)}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">নতুন আগে</SelectItem>
                  <SelectItem value="oldest">পুরোনো আগে</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
            ) : shows.length === 0 ? (
              <div className="text-center py-16">
                <Radio className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">এখনো কোনো প্রচারিত অনুষ্ঠান নেই।</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {shows.map((show) => (
                    <ShowCard key={show.id} show={show} isPlaying={isShowPlaying(show.id)} onPlay={() => play(show)} onShare={() => share(show)} />
                  ))}
                </div>
                {hasNextPage && (
                  <Button variant="outline" className="w-full mt-4" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                    {isFetchingNextPage ? "লোড হচ্ছে…" : "আরও দেখুন"}
                  </Button>
                )}
              </>
            )}
          </>
        ) : historyLoading ? (
          <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-16">
            <History className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">আপনি এখনো কোনো অনুষ্ঠান শোনেননি।</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(history as any[]).map((row) => {
              const show = row.show as OnAirShow
              const pct = row.duration_seconds ? Math.min(100, Math.round((row.position_seconds / row.duration_seconds) * 100)) : null
              return (
                <div key={row.id} className="space-y-1">
                  <ShowCard show={show} isPlaying={isShowPlaying(show.id)} onPlay={() => play(show)} onShare={() => share(show)} />
                  {pct !== null && (
                    <div className="px-3">
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {row.completed ? "শোনা শেষ" : `${pct}% শোনা হয়েছে`}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}

/** /shows/:showId — the deep-link target for a shared show. */
function SingleShow({ showId }: { showId: string }) {
  const { data: show, isLoading } = trpc.rj.onAir.show.useQuery({ id: showId })
  const { play, isShowPlaying } = useOnAirShowPlayer()
  const share = useShareShow()

  useEffect(() => {
    document.title = show?.title ? `${show.title} — BoiAro On Air` : "অনুষ্ঠান — BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [show?.title])

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-10 max-w-2xl">
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2 mb-3 text-xs text-muted-foreground">
          <Link to="/shows"><ChevronLeft className="w-3.5 h-3.5" /> আগের অনুষ্ঠান</Link>
        </Button>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : !show ? (
          <div className="text-center py-20">
            <Radio className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h1 className="text-xl font-serif font-bold">অনুষ্ঠানটি পাওয়া যায়নি</h1>
            <p className="text-muted-foreground text-sm mt-1">লিংকটি ভুল হতে পারে, অথবা অনুষ্ঠানটি সরিয়ে নেওয়া হয়েছে।</p>
            <Button asChild className="mt-4"><Link to="/on-air">On Air-এ ফিরে যান</Link></Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ShowCard
              show={show as OnAirShow}
              isPlaying={isShowPlaying(show.id)}
              onPlay={() => play(show as OnAirShow)}
              onShare={() => share(show as OnAirShow)}
            />
            {show.locked && (
              <p className="text-sm text-muted-foreground text-center">
                এটি একটি প্রিমিয়াম অনুষ্ঠান — শুনতে সাবস্ক্রিপশন প্রয়োজন।
              </p>
            )}
            {show.description && (
              <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{show.description}</p>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
