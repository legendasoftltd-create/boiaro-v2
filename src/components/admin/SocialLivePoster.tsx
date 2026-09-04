import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SiteImageUpload } from "@/components/admin/SiteImageUpload"
import { ImageIcon, Eye, Trash2, Loader2, Info, Check } from "lucide-react"
import { toast } from "sonner"

/**
 * The poster shown inside the Social Live video scene.
 *
 * Preview renders the *actual scene the encoder would publish*, not a
 * thumbnail of the chosen file. What matters is whether the artwork sits well
 * beside the Bengali show title, the LIVE badge and the branding at
 * 1920x1080 — and only the real render can answer that.
 */
export function SocialLivePoster() {
  const utils = trpc.useUtils()
  const settingsQuery = trpc.admin.socialPosterSettings.useQuery()
  const saveMutation = trpc.admin.setSocialPoster.useMutation()

  const [draft, setDraft] = useState<string | null>(null)
  const [previewOf, setPreviewOf] = useState<string | null | undefined>(undefined)

  const s = settingsQuery.data
  // Until the admin touches anything, the draft mirrors whatever is saved.
  const current = draft ?? s?.customPosterUrl ?? ""
  const dirty = draft !== null && draft !== (s?.customPosterUrl ?? "")

  const previewQuery = trpc.admin.socialScenePreview.useQuery(
    { posterUrl: previewOf ?? null },
    { enabled: previewOf !== undefined, staleTime: 0 }
  )

  const save = async (value: string | null) => {
    try {
      await saveMutation.mutateAsync({ posterUrl: value })
      await Promise.all([
        utils.admin.socialPosterSettings.invalidate(),
        utils.admin.socialScenePreview.invalidate(),
      ])
      setDraft(null)
      setPreviewOf(undefined)
      toast.success(value ? "Live poster saved" : "Poster removed — back to the automatic choice")
    } catch (e: any) {
      toast.error(e.message || "Could not save the poster")
    }
  }

  const sourceLabel: Record<string, string> = {
    custom: "your chosen poster",
    show: "the current show's cover",
    station: "the station artwork",
    none: "the plain BoiAro card",
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5" />
          Live poster
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The artwork shown in the video that goes to Facebook and YouTube. It is fitted whole — never
          stretched or cropped — and the background is filled from the image itself, so any shape works.
        </p>

        {settingsQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="rounded-lg border p-3 text-sm flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
              <span>
                A broadcast started now would use <b>{sourceLabel[s?.effectiveSource ?? "none"]}</b>.
                {s?.effectiveSource === "show" ? " That happens automatically — no action needed." : ""}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Poster image</Label>
              <SiteImageUpload
                value={current}
                onChange={(url) => { setDraft(url); setPreviewOf(undefined) }}
                fieldKey="social-live-poster"
              />
              <p className="text-xs text-muted-foreground">
                Upload a file or paste an image URL. Leave it empty to fall back to the show cover.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!s?.showCoverUrl}
                onClick={() => { setDraft(s?.showCoverUrl ?? ""); setPreviewOf(undefined) }}
                title={s?.showCoverUrl ? undefined : "The show on air has no cover image"}
              >
                Use current show cover
              </Button>

              <Button variant="outline" size="sm" onClick={() => setPreviewOf(current || null)}>
                <Eye className="w-4 h-4 mr-2" /> Preview
              </Button>

              <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => save(current || null)}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Save
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!s?.customPosterUrl || saveMutation.isPending}
                onClick={() => { if (confirm("Remove the custom poster and go back to the automatic choice?")) save(null) }}
              >
                <Trash2 className="w-4 h-4 mr-2 text-red-500" /> Remove
              </Button>
            </div>

            {previewOf !== undefined ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Scene preview</Label>
                  {previewQuery.data && !previewQuery.data.posterLoaded && previewQuery.data.posterUrl ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                      image could not be loaded — showing the fallback
                    </Badge>
                  ) : null}
                </div>
                {previewQuery.isFetching ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center border rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin" /> Rendering the real scene…
                  </div>
                ) : previewQuery.data ? (
                  <img
                    src={previewQuery.data.dataUrl}
                    alt="How the live video will look"
                    className="w-full rounded-lg border"
                  />
                ) : previewQuery.error ? (
                  <p className="text-sm text-red-500">{previewQuery.error.message}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  This is the actual 1920×1080 frame the encoder would publish, scaled down.
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
