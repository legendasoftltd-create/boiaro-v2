import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AudioFileUpload } from "@/components/admin/AudioFileUpload"
import { Music, Trash2, Loader2, Disc3, CheckCircle2, XCircle, EyeOff, Eye, Clock } from "lucide-react"
import { toast } from "sonner"

type Category = "music" | "jingle" | "sfx"

const CATEGORY_LABEL: Record<Category, string> = { music: "Music", jingle: "Jingle", sfx: "SFX" }

export default function AdminStudioLibrary() {
  const utils = trpc.useUtils()
  const [filter, setFilter] = useState<Category | "all">("all")
  const { data: assets = [], isLoading } = trpc.studio.libraryList.useQuery({ category: filter === "all" ? undefined : filter, adminView: true })
  const { data: pending = [] } = trpc.studio.libraryModeration.useQuery()

  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<Category>("music")
  const [fileUrl, setFileUrl] = useState("")

  const uploadMutation = trpc.studio.libraryUpload.useMutation({
    onSuccess: () => {
      utils.studio.libraryList.invalidate()
      setTitle("")
      setFileUrl("")
      toast.success("Added to the platform library")
    },
    onError: (e) => toast.error(e.message),
  })
  const deleteMutation = trpc.studio.libraryDelete.useMutation({
    onSuccess: () => { utils.studio.libraryList.invalidate(); toast.success("Removed") },
    onError: (e) => toast.error(e.message),
  })
  const moderateMutation = trpc.studio.moderateLibraryAsset.useMutation({
    onSuccess: () => {
      utils.studio.libraryList.invalidate()
      utils.studio.libraryModeration.invalidate()
      toast.success("Updated")
    },
    onError: (e) => toast.error(e.message),
  })

  const platformAssets = assets.filter((a: any) => !a.owner_user_id)

  const handleAdd = () => {
    if (!title.trim() || !fileUrl.trim()) {
      toast.error("Title and audio file are required")
      return
    }
    uploadMutation.mutate({ title: title.trim(), category, fileUrl: fileUrl.trim(), platformWide: true })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Disc3 className="w-6 h-6 text-primary" /> Studio Music Library</h1>
        <p className="text-muted-foreground text-sm">Background music, jingles, and SFX every RJ can use in BoiAro Studio's mixer</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Add to Library</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning Show Bed" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="music">Music</SelectItem>
                  <SelectItem value="jingle">Jingle</SelectItem>
                  <SelectItem value="sfx">SFX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Audio File</Label>
            <AudioFileUpload value={fileUrl} onChange={setFileUrl} fieldKey="studio-library-upload" placeholder="Upload a file or paste an audio URL" />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Add to Library
          </Button>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400" /> Pending Review ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pending.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 text-sm">
                <Badge variant="secondary" className="text-[10px] shrink-0">{CATEGORY_LABEL[a.category as Category]}</Badge>
                <span className="flex-1 font-medium truncate">{a.title}</span>
                <audio controls src={a.file_url} className="h-8 max-w-[200px]" preload="none" />
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={moderateMutation.isPending} onClick={() => moderateMutation.mutate({ assetId: a.id, action: "approve" })}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" disabled={moderateMutation.isPending} onClick={() => moderateMutation.mutate({ assetId: a.id, action: "reject" })}>
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "music", "jingle", "sfx"] as const).map((c) => (
          <Button key={c} size="sm" variant={filter === c ? "default" : "outline"} className="text-xs" onClick={() => setFilter(c)}>
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Music className="w-4 h-4" /> Platform Library ({platformAssets.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : platformAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in the library yet.</p>
          ) : (
            platformAssets.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 text-sm">
                <Badge variant="secondary" className="text-[10px] shrink-0">{CATEGORY_LABEL[a.category as Category]}</Badge>
                <span className="flex-1 font-medium truncate">{a.title}</span>
                {a.status === "unpublished" && <Badge variant="outline" className="text-[9px] shrink-0">unpublished</Badge>}
                <audio controls src={a.file_url} className="h-8 max-w-[200px]" preload="none" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  disabled={moderateMutation.isPending}
                  title={a.status === "unpublished" ? "Publish" : "Unpublish"}
                  onClick={() => moderateMutation.mutate({ assetId: a.id, action: a.status === "unpublished" ? "publish" : "unpublish" })}
                >
                  {a.status === "unpublished" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive shrink-0"
                  disabled={deleteMutation.isPending}
                  onClick={() => { if (window.confirm(`Remove "${a.title}" from the library?`)) deleteMutation.mutate({ id: a.id }) }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
