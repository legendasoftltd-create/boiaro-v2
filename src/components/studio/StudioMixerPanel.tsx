import { useEffect, useRef, useState } from "react"
import type { Room } from "livekit-client"
import { trpc } from "@/lib/trpc"
import { useStudioMixer, type MixerAsset } from "@/hooks/useStudioMixer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AudioFileUpload } from "@/components/admin/AudioFileUpload"
import { Music, Play, Square, Plus, X, Volume2, Upload, Loader2, Zap } from "lucide-react"
import { toast } from "sonner"

type Category = "music" | "jingle" | "sfx"
const CATEGORY_LABEL: Record<Category, string> = { music: "Music", jingle: "Jingle", sfx: "SFX" }

export function StudioMixerPanel({ sessionId, getRoom, isSpeaking }: { sessionId: string; getRoom: () => Room | null; isSpeaking: boolean }) {
  const mixer = useStudioMixer(getRoom, isSpeaking)
  const utils = trpc.useUtils()
  const [tab, setTab] = useState<Category>("music")
  const [playlistItemId, setPlaylistItemId] = useState<string | null>(null)
  const prevNowPlayingRef = useRef<MixerAsset | null>(null)

  const { data: assets = [] } = trpc.studio.libraryList.useQuery({ category: tab })
  const { data: playlist = [] } = trpc.studio.playlist.useQuery({ sessionId })

  const addToPlaylistMutation = trpc.studio.addToPlaylist.useMutation({
    onSuccess: () => utils.studio.playlist.invalidate({ sessionId }),
    onError: (e) => toast.error(e.message),
  })
  const removeFromPlaylistMutation = trpc.studio.removeFromPlaylist.useMutation({
    onSuccess: () => utils.studio.playlist.invalidate({ sessionId }),
    onError: (e) => toast.error(e.message),
  })
  const advancePlaylistMutation = trpc.studio.advancePlaylist.useMutation({
    onSuccess: (next) => {
      utils.studio.playlist.invalidate({ sessionId })
      if (next) {
        setPlaylistItemId(next.id)
        mixer.playTrack(next.asset as MixerAsset)
      } else {
        setPlaylistItemId(null)
      }
    },
  })

  // Detect the current track finishing (nowPlaying -> null) to auto-advance
  // the queue — only when what just ended was actually a queued item, not
  // an ad-hoc library play.
  useEffect(() => {
    if (prevNowPlayingRef.current && !mixer.nowPlaying && playlistItemId) {
      advancePlaylistMutation.mutate({ sessionId, itemId: playlistItemId })
    }
    prevNowPlayingRef.current = mixer.nowPlaying
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer.nowPlaying])

  const queued = playlist.filter((p: any) => !p.played_at)

  const handlePlayNow = (asset: MixerAsset) => {
    setPlaylistItemId(null)
    mixer.playTrack(asset)
  }

  const handlePlayQueue = () => {
    if (queued.length === 0) return
    setPlaylistItemId(queued[0].id)
    mixer.playTrack(queued[0].asset as MixerAsset)
  }

  const handleStop = () => {
    setPlaylistItemId(null)
    mixer.stopMusic()
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-3 space-y-3">
        {mixer.nowPlaying && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-sm">
            <Music className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1 truncate font-medium">{mixer.nowPlaying.title}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleStop}><Square className="w-3.5 h-3.5" /></Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Slider value={[Math.round(mixer.musicVolume * 100)]} onValueChange={([v]) => mixer.setMusicVolume(v / 100)} max={100} min={0} step={5} className="flex-1" />
          <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(mixer.musicVolume * 100)}%</span>
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <Zap className={`w-3.5 h-3.5 ${mixer.isDucked ? "text-amber-400" : "text-muted-foreground"}`} />
            <span className="text-xs">Ducking {mixer.isDucked && <span className="text-amber-400">(active)</span>}</span>
          </div>
          <Switch checked={mixer.duckingEnabled} onCheckedChange={mixer.setDuckingEnabled} />
        </div>

        {queued.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Queue ({queued.length})</p>
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handlePlayQueue} disabled={!!playlistItemId}>
                <Play className="w-3 h-3 mr-1" /> Play Queue
              </Button>
            </div>
            {queued.map((item: any) => (
              <div key={item.id} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 text-xs">
                <span className="flex-1 truncate">{item.asset.title}</span>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeFromPlaylistMutation.mutate({ sessionId, itemId: item.id })}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Category)}>
          <TabsList className="h-8">
            {(["music", "jingle", "sfx"] as Category[]).map((c) => (
              <TabsTrigger key={c} value={c} className="text-[11px] px-2.5">{CATEGORY_LABEL[c]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {assets.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">এখানে কিছু নেই — নিচে নিজের ট্র্যাক যোগ করুন, বা অ্যাডমিনকে লাইব্রেরিতে যোগ করতে বলুন।</p>
          ) : (
            assets.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/20 text-xs">
                <span className="flex-1 truncate">{a.title}</span>
                {!a.owner_user_id && <Badge variant="outline" className="text-[9px]">library</Badge>}
                {tab === "music" ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handlePlayNow(a)}>
                      <Play className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => addToPlaylistMutation.mutate({ sessionId, audioAssetId: a.id })}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => mixer.triggerOneShot(a)}>
                    Play
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <MixerUploadForm category={tab} onUploaded={() => utils.studio.libraryList.invalidate({ category: tab })} />
      </CardContent>
    </Card>
  )
}

function MixerUploadForm({ category, onUploaded }: { category: Category; onUploaded: () => void }) {
  const [title, setTitle] = useState("")
  const [fileUrl, setFileUrl] = useState("")
  const [licenseAcknowledged, setLicenseAcknowledged] = useState(false)

  const uploadMutation = trpc.studio.libraryUpload.useMutation({
    onSuccess: () => {
      setTitle("")
      setFileUrl("")
      setLicenseAcknowledged(false)
      onUploaded()
      toast.success("যোগ করা হয়েছে")
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = () => {
    if (!title.trim() || !fileUrl.trim()) {
      toast.error("শিরোনাম ও অডিও ফাইল দরকার")
      return
    }
    if (!licenseAcknowledged) {
      toast.error("এই অডিও ব্যবহারের অধিকার আছে তা নিশ্চিত করুন")
      return
    }
    uploadMutation.mutate({ title: title.trim(), category, fileUrl: fileUrl.trim(), licenseAcknowledged: true })
  }

  return (
    <div className="p-2.5 rounded-lg bg-muted/20 space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"><Upload className="w-3 h-3" /> নিজের {CATEGORY_LABEL[category]} যোগ করুন</p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="শিরোনাম" className="h-8 text-xs" />
      <AudioFileUpload value={fileUrl} onChange={setFileUrl} fieldKey="studio-mixer-upload" placeholder="ফাইল আপলোড করুন বা URL দিন" />
      <label className="flex items-start gap-2 text-[10.5px] text-muted-foreground">
        <Checkbox checked={licenseAcknowledged} onCheckedChange={(v) => setLicenseAcknowledged(!!v)} className="mt-0.5" />
        আমি নিশ্চিত করছি এই অডিও ব্যবহারের অধিকার আমার আছে এবং কপিরাইট লঙ্ঘন করছি না।
      </label>
      <Button size="sm" className="h-7 text-xs w-full" onClick={handleSubmit} disabled={uploadMutation.isPending}>
        {uploadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
        যোগ করুন
      </Button>
    </div>
  )
}
