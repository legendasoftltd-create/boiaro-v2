import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AudioFileUpload } from "@/components/admin/AudioFileUpload"
import { Music, Trash2, Loader2, Disc3, CheckCircle2, XCircle, EyeOff, Eye, Clock } from "lucide-react"
import { toast } from "sonner"

type Category = "music" | "jingle" | "sfx"
type LicenseType = "royalty_free" | "creative_commons" | "purchased" | "original" | "other"

const CATEGORY_LABEL: Record<Category, string> = { music: "Music", jingle: "Jingle", sfx: "SFX" }
const LICENSE_TYPE_LABEL: Record<LicenseType, string> = {
  royalty_free: "Royalty-free", creative_commons: "Creative Commons",
  purchased: "Purchased", original: "Original", other: "Other",
}

export default function AdminStudioLibrary() {
  const utils = trpc.useUtils()
  const [filter, setFilter] = useState<Category | "all">("all")
  const { data: assets = [], isLoading } = trpc.studio.libraryList.useQuery({ category: filter === "all" ? undefined : filter, adminView: true })
  const { data: pending = [] } = trpc.studio.libraryModeration.useQuery()

  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<Category>("music")
  const [fileUrl, setFileUrl] = useState("")
  const [rightsHolder, setRightsHolder] = useState("")
  const [licenseType, setLicenseType] = useState<LicenseType>("royalty_free")
  const [licenseDocumentUrl, setLicenseDocumentUrl] = useState("")
  const [allowedUsage, setAllowedUsage] = useState("")
  // Social Broadcast Rights (§16). Kept separate from allowedUsage because
  // Facebook and YouTube run automated content matching — a track that is
  // fine on BoiAro's own app can mute a video or strike the Page.
  const [socialRights, setSocialRights] = useState({
    app: true, website: true, facebook: false, youtube: false, other: false,
  })

  const uploadMutation = trpc.studio.libraryUpload.useMutation({
    onSuccess: () => {
      utils.studio.libraryList.invalidate()
      setTitle("")
      setFileUrl("")
      setRightsHolder("")
      setLicenseType("royalty_free")
      setLicenseDocumentUrl("")
      setAllowedUsage("")
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
    if (!rightsHolder.trim()) {
      toast.error("Rights holder is required")
      return
    }
    uploadMutation.mutate({
      title: title.trim(), category, fileUrl: fileUrl.trim(), platformWide: true,
      rightsHolder: rightsHolder.trim(), licenseType,
      licenseDocumentUrl: licenseDocumentUrl.trim() || undefined,
      allowedUsage: allowedUsage.trim() || undefined,
      socialRights,
    })
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rights holder</Label>
              <Input value={rightsHolder} onChange={(e) => setRightsHolder(e.target.value)} placeholder="Who owns this track" />
            </div>
            <div className="space-y-1.5">
              <Label>License type</Label>
              <Select value={licenseType} onValueChange={(v) => setLicenseType(v as LicenseType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LICENSE_TYPE_LABEL) as LicenseType[]).map((t) => (
                    <SelectItem key={t} value={t}>{LICENSE_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>License document URL (optional)</Label>
              <Input value={licenseDocumentUrl} onChange={(e) => setLicenseDocumentUrl(e.target.value)} placeholder="Link to a license/purchase receipt" />
            </div>
            <div className="space-y-1.5">
              <Label>Allowed usage (optional)</Label>
              <Input value={allowedUsage} onChange={(e) => setAllowedUsage(e.target.value)} placeholder="e.g. broadcast only, no resale" />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <Label>Social broadcast rights</Label>
            <p className="text-[11px] text-muted-foreground">
              Where this track is cleared to be broadcast. Facebook and YouTube match audio automatically,
              so an uncleared track can mute a video or put a strike on the Page or channel. Leaving a box
              unticked shows the RJ a warning — it does not block playback.
            </p>
            <div className="flex flex-wrap gap-4 pt-1">
              {([
                ["app", "BoiAro App"],
                ["website", "BoiAro Website"],
                ["facebook", "Facebook"],
                ["youtube", "YouTube"],
                ["other", "Other social platforms"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={socialRights[key]}
                    onCheckedChange={(v) => setSocialRights((r) => ({ ...r, [key]: Boolean(v) }))}
                  />
                  {label}
                </label>
              ))}
            </div>
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
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {a.rights_holder || "—"} · {a.license_type ? LICENSE_TYPE_LABEL[a.license_type as LicenseType] ?? a.license_type : "—"}
                    {a.allowed_usage ? ` · ${a.allowed_usage}` : ""}
                  </p>
                </div>
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
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {a.rights_holder || "—"} · {a.license_type ? LICENSE_TYPE_LABEL[a.license_type as LicenseType] ?? a.license_type : "—"}
                    {(() => {
                      const cleared = [a.social_rights_facebook && "FB", a.social_rights_youtube && "YT"].filter(Boolean)
                      return cleared.length
                        ? <span className="text-green-600 dark:text-green-500"> · cleared for {cleared.join(" + ")}</span>
                        : <span className="text-amber-600 dark:text-amber-500"> · not cleared for social</span>
                    })()}
                  </p>
                </div>
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
