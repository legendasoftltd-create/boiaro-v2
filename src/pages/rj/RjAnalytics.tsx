import { useState, useMemo, useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart3, Loader2 } from "lucide-react"

const STAT_LABELS: { key: string; label: string }[] = [
  { key: "totalSessions", label: "Total Sessions" },
  { key: "uniqueListeners", label: "Unique Listeners" },
  { key: "returningListeners", label: "Returning Listeners" },
  { key: "newListeners", label: "New Listeners" },
  { key: "peakConcurrentListeners", label: "Peak Concurrent (Chat)" },
  { key: "icecastPeakListeners", label: "Stream Peak (Icecast)" },
  { key: "icecastAverageListeners", label: "Stream Avg (Icecast)" },
  { key: "totalListeningMinutes", label: "Total Listening (min)" },
  { key: "averageListeningMinutes", label: "Avg. Listening (min)" },
  { key: "newFollowers", label: "New Followers" },
  { key: "chatCount", label: "Chat Messages" },
  { key: "uniqueChatUsers", label: "Unique Chat Users" },
  { key: "reactionCount", label: "Reactions" },
  { key: "requestCount", label: "Song Requests" },
  { key: "catchupPlays", label: "Catch-up Plays" },
  { key: "catchupUniqueListeners", label: "Catch-up Unique Listeners" },
  { key: "catchupCompletionRatePct", label: "Catch-up Completion %" },
]

export default function RjAnalytics() {
  const [range, setRange] = useState<"7" | "30" | "90">("30")
  const [groupBy, setGroupBy] = useState<"none" | "show">("none")
  const from = useMemo(() => new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString(), [range])
  const { data, isLoading } = trpc.rj.myAnalytics.useQuery({ from, groupBy })

  useEffect(() => {
    document.title = "Analytics — BoiAro On Air"
    return () => { document.title = "BoiAro" }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif">Analytics</h1>
        <p className="text-muted-foreground text-sm">Your listener numbers, engagement, and catch-up performance</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(["7", "30", "90"] as const).map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)} className="text-xs">Last {r}d</Button>
        ))}
        <span className="text-muted-foreground text-xs mx-1">Group by:</span>
        {(["none", "show"] as const).map((g) => (
          <Button key={g} size="sm" variant={groupBy === g ? "default" : "outline"} onClick={() => setGroupBy(g)} className="text-xs">{g === "none" ? "Nothing" : "Show"}</Button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : data.summary.totalSessions === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No sessions in this period yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STAT_LABELS.map((s) => (
              <Card key={s.key} className="border-border/30"><CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{(data.summary as any)[s.key]}</p>
              </CardContent></Card>
            ))}
          </div>

          {Object.keys(data.summary.deviceBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Device / Platform Breakdown</CardTitle></CardHeader>
              <CardContent className="flex gap-4 flex-wrap">
                {Object.entries(data.summary.deviceBreakdown).map(([platform, count]) => (
                  <div key={platform} className="text-sm"><span className="font-medium capitalize">{platform}</span>: {count as number}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.summary.countryBreakdown && Object.keys(data.summary.countryBreakdown).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Country Breakdown</CardTitle></CardHeader>
              <CardContent className="flex gap-4 flex-wrap">
                {Object.entries(data.summary.countryBreakdown).map(([country, count]) => (
                  <div key={country} className="text-sm"><span className="font-medium">{country}</span>: {count as number}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.groups && data.groups.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">By Show</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md px-3 py-2">
                  🏆 Your top show this period: <span className="font-semibold">{(data.groups as any[])[0].label}</span>
                  {" "}({(data.groups as any[])[0].uniqueListeners} unique listeners)
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Show</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Unique Listeners</TableHead>
                        <TableHead className="text-right">Peak (Chat)</TableHead>
                        <TableHead className="text-right">Stream Peak</TableHead>
                        <TableHead className="text-right">Stream Avg</TableHead>
                        <TableHead className="text-right">Avg. Min</TableHead>
                        <TableHead className="text-right">Chat</TableHead>
                        <TableHead className="text-right">Catch-up %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.groups as any[]).map((g) => (
                        <TableRow key={g.key}>
                          <TableCell className="font-medium">{g.label}</TableCell>
                          <TableCell className="text-right">{g.totalSessions}</TableCell>
                          <TableCell className="text-right">{g.uniqueListeners}</TableCell>
                          <TableCell className="text-right">{g.peakConcurrentListeners}</TableCell>
                          <TableCell className="text-right">{g.icecastPeakListeners}</TableCell>
                          <TableCell className="text-right">{g.icecastAverageListeners}</TableCell>
                          <TableCell className="text-right">{g.averageListeningMinutes}</TableCell>
                          <TableCell className="text-right">{g.chatCount}</TableCell>
                          <TableCell className="text-right">{g.catchupCompletionRatePct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
