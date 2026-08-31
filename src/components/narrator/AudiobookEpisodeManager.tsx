import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, Loader2, Lock, FileAudio, Music, Pencil, Trash2, Unlock,
  Video, GripVertical, AlertTriangle, Coins, Upload, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { validateMediaFile, sanitizeTrackTitle, ACCEPTED_FILE_INPUT } from "@/lib/audioValidation";
import { getValidAccessToken } from "@/lib/authTokens";

interface AudiobookEpisodeManagerProps {
  bookFormatId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_CHAPTER_PRICE = 100;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

async function uploadViaApi(file: File, onProgress?: (pct: number) => void): Promise<string> {
  // Resolved before the executor: the token may need renewing, and a
  // Promise executor cannot await.
  const token = await getValidAccessToken();
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve((JSON.parse(xhr.responseText) as { url: string }).url); }
        catch { reject(new Error("Upload failed: invalid server response")); }
      } else {
        try { reject(new Error((JSON.parse(xhr.responseText) as any).error || "Upload failed")); }
        catch { reject(new Error(`Upload failed (HTTP ${xhr.status})`)); }
      }
    });
    xhr.addEventListener("error",   () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort",   () => reject(new Error("Upload cancelled")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out — check your connection and try again")));
    xhr.timeout = 30 * 60 * 1000; // 30-minute hard limit prevents infinite hang
    xhr.open("POST", `${API_BASE}/upload/media`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

export function AudiobookEpisodeManager({ bookFormatId, bookTitle, open, onOpenChange }: AudiobookEpisodeManagerProps) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<{ id: string; title: string; chapter_price: string } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [form, setForm] = useState({ title: "", duration: "", chapter_price: "", audioUrl: "", mediaType: "audio" });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingForTrack, setUploadingForTrack] = useState<string | null>(null);
  const [trackUploadProgress, setTrackUploadProgress] = useState<Record<string, number>>({});
  const touchState = useRef<{ idx: number; startY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: episodes = [], isLoading } = trpc.books.audiobookTracks.useQuery(
    { bookFormatId },
    { enabled: open && !!bookFormatId }
  );
  const { data: formatData } = trpc.books.bookFormatPrice.useQuery(
    { bookFormatId },
    { enabled: open && !!bookFormatId }
  );
  const fullAudiobookPrice = formatData?.price ?? null;

  const invalidate = () => utils.books.audiobookTracks.invalidate({ bookFormatId });

  const addMutation = trpc.books.addAudiobookTrack.useMutation({
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setForm({ title: "", duration: "", chapter_price: "", audioUrl: "", mediaType: "audio" });
      toast.success(`Episode ${episodes.length + 1} added`);
    },
    onError: (err) => toast.error(err.message),
  });

  const submitMutation = trpc.books.submitAudiobookTrack.useMutation({
    onSuccess: () => { invalidate(); toast.success("Episode submitted for review"); },
  });

  const deleteMutation = trpc.books.deleteAudiobookTrack.useMutation({
    onSuccess: () => { invalidate(); toast.success("Episode deleted"); },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.books.updateAudiobookTrack.useMutation({
    onSuccess: () => { invalidate(); setEditingEpisode(null); toast.success("Episode updated"); },
  });

  const uploadTrackMutation = trpc.books.uploadTrackAudio.useMutation({
    onSuccess: () => { invalidate(); toast.success("Audio attached to episode"); },
    onError: (err) => toast.error(err.message),
  });

  const togglePreviewMutation = trpc.books.toggleTrackPreview.useMutation({
    onSuccess: () => invalidate(),
  });

  const reorderMutation = trpc.books.reorderAudiobookTracks.useMutation({
    onSuccess: () => { invalidate(); },
    onError: () => { invalidate(); toast.error("Reorder failed"); },
  });

  /* ── File upload helpers ── */

  const processAndUpload = async (
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<{ url: string; mediaType: string; duration: string; title: string }> => {
    const validation = await validateMediaFile(file);
    if (validation.valid === false) throw new Error(validation.error);
    const { file: validatedFile, durationLabel, mediaType } = validation.data;
    const url = await uploadViaApi(validatedFile, onProgress);
    return { url, mediaType, duration: durationLabel, title: sanitizeTrackTitle(file.name) };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadProgress(0);
    try {
      const { url, mediaType, duration, title } = await processAndUpload(file, setUploadProgress);
      setForm(f => ({
        ...f,
        audioUrl: url,
        mediaType,
        duration: f.duration || duration,
        title: f.title || title,
      }));
      toast.success(`${mediaType === "video" ? "Video" : "Audio"} uploaded`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleTrackFileSelect = async (trackId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingForTrack(trackId);
    setTrackUploadProgress(p => ({ ...p, [trackId]: 0 }));
    try {
      const { url, mediaType, duration } = await processAndUpload(
        file,
        (pct) => setTrackUploadProgress(p => ({ ...p, [trackId]: pct }))
      );
      uploadTrackMutation.mutate({ trackId, audioUrl: url, mediaType, duration });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingForTrack(null);
      setTrackUploadProgress(p => { const n = { ...p }; delete n[trackId]; return n; });
    }
  };

  /* ── Save new episode ── */

  const saveEpisode = () => {
    if (!form.title.trim()) { toast.error("Episode title is required"); return; }
    if (!form.audioUrl) { toast.error("Please upload an audio/video file first"); return; }
    addMutation.mutate({
      bookFormatId,
      title: form.title.trim(),
      duration: form.duration || undefined,
      chapterPrice: form.chapter_price ? Number(form.chapter_price) : undefined,
      audioUrl: form.audioUrl,
      mediaType: form.mediaType || undefined,
    });
  };

  /* ── Drag / touch reorder ── */

  const handleDragStart = useCallback((idx: number) => { setDragIdx(idx); }, []);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx); }, []);

  const handleDragEnd = useCallback(async () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...episodes];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(overIdx, 0, moved);
    const updated = reordered.map((ep, i) => ({ ...ep, track_number: i + 1 }));
    setDragIdx(null); setOverIdx(null);
    setReordering(true);
    reorderMutation.mutate({ tracks: updated.map(ep => ({ id: ep.id, trackNumber: ep.track_number })) });
    setReordering(false);
  }, [dragIdx, overIdx, episodes]);

  const handleTouchStart = useCallback((idx: number, e: React.TouchEvent) => {
    touchState.current = { idx, startY: e.touches[0].clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchState.current) return;
    const y = e.touches[0].clientY;
    const items = document.querySelectorAll("[data-ep-idx]");
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) { setOverIdx(i); break; }
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (touchState.current && overIdx !== null) {
      const from = touchState.current.idx;
      const to = overIdx;
      touchState.current = null;
      if (from === to) { setOverIdx(null); return; }
      const reordered = [...episodes];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      const updated = reordered.map((ep, i) => ({ ...ep, track_number: i + 1 }));
      setDragIdx(null); setOverIdx(null);
      setReordering(true);
      reorderMutation.mutate({ tracks: updated.map(ep => ({ id: ep.id, trackNumber: ep.track_number })) });
      setReordering(false);
    } else {
      touchState.current = null; setOverIdx(null);
    }
  }, [overIdx, episodes]);

  /* ── Derived totals ── */

  const totalChapterCoinPrice = episodes.reduce((sum, ep) => ep.is_preview ? sum : sum + (ep.chapter_price ?? DEFAULT_CHAPTER_PRICE), 0);
  const totalChapterBDT = totalChapterCoinPrice * 0.05;
  const priceWarning = fullAudiobookPrice !== null && fullAudiobookPrice > 0 && totalChapterBDT < fullAudiobookPrice;
  const isLocked = (status: string) => status !== "draft";

  const statusBadge = (status: string) => {
    const config: Record<string, { cls: string; label: string }> = {
      draft: { cls: "bg-secondary text-muted-foreground", label: "Draft" },
      pending: { cls: "bg-yellow-500/20 text-yellow-400", label: "Pending" },
      approved: { cls: "bg-emerald-500/20 text-emerald-400", label: "Approved" },
      rejected: { cls: "bg-destructive/20 text-destructive", label: "Rejected" },
    };
    const c = config[status] || config.draft;
    return <Badge variant="outline" className={`text-[9px] ${c.cls}`}>{c.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-primary" />
            Episodes — {bookTitle}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Pricing summary */}
            {episodes.length > 0 && (
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total chapter coin price:</span>
                  <span className="font-semibold flex items-center gap-1">
                    <Coins className="w-3 h-3 text-primary" /> {totalChapterCoinPrice} coins (≈ ৳{totalChapterBDT.toFixed(0)})
                  </span>
                </div>
                {fullAudiobookPrice !== null && fullAudiobookPrice > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Full audiobook price:</span>
                    <span className="font-semibold">৳{fullAudiobookPrice}</span>
                  </div>
                )}
                {priceWarning && (
                  <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 rounded px-2 py-1">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Full audiobook price (৳{fullAudiobookPrice}) is higher than total chapter value (≈ ৳{totalChapterBDT.toFixed(0)}).
                  </div>
                )}
              </div>
            )}

            {reordering && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving order...
              </div>
            )}

            {/* Episode list */}
            {episodes.length > 0 && (
              <div className="space-y-0 rounded-lg border border-border/30 overflow-hidden">
                <div className="grid grid-cols-[2rem_2rem_1fr_5rem_4.5rem_4.5rem_auto] items-center gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-secondary/30 border-b border-border/30">
                  <span></span><span>#</span><span>Title</span><span>Duration</span><span>Price</span><span>Preview</span><span>Actions</span>
                </div>
                {episodes.map((ep, idx) => {
                  const locked = isLocked(ep.status);
                  const isDragging = dragIdx === idx;
                  const isOver = overIdx === idx && dragIdx !== idx;
                  const chapterCost = ep.is_preview ? 0 : (ep.chapter_price ?? DEFAULT_CHAPTER_PRICE);
                  const isDefault = !ep.is_preview && ep.chapter_price === null;
                  return (
                    <div
                      key={ep.id}
                      data-ep-idx={idx}
                      draggable={!locked}
                      onDragStart={() => !locked && handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={e => !locked && handleTouchStart(idx, e)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className={`grid grid-cols-[2rem_2rem_1fr_5rem_4.5rem_4.5rem_auto] items-center gap-2 px-3 py-2.5 border-b border-border/10 transition-all duration-150 ${
                        isDragging ? "opacity-40 bg-primary/5" : isOver ? "border-primary border-dashed bg-primary/5" : "hover:bg-secondary/30"
                      } ${!locked ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex-shrink-0">
                        {!locked && <GripVertical className="h-4 w-4 text-muted-foreground touch-none" />}
                      </div>
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {ep.track_number}
                      </div>
                      <div className="min-w-0">
                        {editingEpisode?.id === ep.id ? (
                          <div className="space-y-1.5">
                            <div className="flex gap-2">
                              <Input value={editingEpisode.title} onChange={e => setEditingEpisode({ ...editingEpisode, title: e.target.value })} className="h-7 text-sm" placeholder="Episode title" />
                              <Input value={editingEpisode.chapter_price} onChange={e => setEditingEpisode({ ...editingEpisode, chapter_price: e.target.value })} className="h-7 text-sm w-20" placeholder={String(DEFAULT_CHAPTER_PRICE)} type="number" min="1" />
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" className="h-7" onClick={() => updateMutation.mutate({ trackId: ep.id, title: editingEpisode.title, chapterPrice: editingEpisode.chapter_price ? Number(editingEpisode.chapter_price) : null })}>Save</Button>
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingEpisode(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{ep.title}</p>
                              {locked && <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {statusBadge(ep.status)}
                              {ep.audio_url ? (
                                <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400">
                                  {ep.media_type === "video"
                                    ? <><Video className="h-2.5 w-2.5 mr-0.5" />Video</>
                                    : <><Music className="h-2.5 w-2.5 mr-0.5" />Audio</>}
                                </Badge>
                              ) : !locked ? (
                                <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400">No file</Badge>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{ep.duration || "—"}</span>
                      <div
                        className={`text-xs font-medium flex items-center gap-0.5 ${!locked ? "cursor-pointer hover:text-primary" : ""}`}
                        onClick={() => !locked && !editingEpisode && setEditingEpisode({ id: ep.id, title: ep.title, chapter_price: ep.chapter_price ? String(ep.chapter_price) : "" })}
                      >
                        {ep.is_preview ? (
                          <span className="text-emerald-400">Free</span>
                        ) : (
                          <span className={`flex items-center gap-0.5 ${isDefault ? "text-muted-foreground" : "text-primary"}`}>
                            🪙 {chapterCost}
                            {isDefault && <span className="text-[9px] opacity-60">(def)</span>}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-center">
                        {ep.is_preview
                          ? <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400">✓</Badge>
                          : <span className="text-[10px] text-muted-foreground">—</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {!locked ? (
                          <>
                            {/* Upload audio for this track */}
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7 relative overflow-hidden"
                              title={uploadingForTrack === ep.id
                                ? trackUploadProgress[ep.id] != null ? `Uploading ${trackUploadProgress[ep.id]}%` : "Uploading…"
                                : ep.audio_url ? "Replace audio" : "Upload audio"}
                              disabled={uploadingForTrack === ep.id}
                              onClick={() => trackFileRefs.current[ep.id]?.click()}
                            >
                              {uploadingForTrack === ep.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {trackUploadProgress[ep.id] != null && (
                                    <span
                                      className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-150"
                                      style={{ width: `${trackUploadProgress[ep.id]}%` }}
                                    />
                                  )}
                                </>
                              ) : ep.audio_url ? (
                                <CheckCircle className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Upload className="h-3 w-3" />
                              )}
                            </Button>
                            <input
                              type="file"
                              accept={ACCEPTED_FILE_INPUT}
                              className="hidden"
                              ref={el => { trackFileRefs.current[ep.id] = el; }}
                              onChange={e => handleTrackFileSelect(ep.id, e)}
                            />
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => submitMutation.mutate({ trackId: ep.id })} disabled={submitMutation.isPending || !ep.audio_url} title={!ep.audio_url ? "Upload audio first" : undefined}>
                              Submit
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => togglePreviewMutation.mutate({ trackId: ep.id, isPreview: !ep.is_preview })} title={ep.is_preview ? "Remove preview" : "Set as preview"}>
                              {ep.is_preview ? <Unlock className="h-3 w-3 text-emerald-400" /> : <Lock className="h-3 w-3" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingEpisode({ id: ep.id, title: ep.title, chapter_price: ep.chapter_price ? String(ep.chapter_price) : "" })}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate({ trackId: ep.id })} disabled={deleteMutation.isPending}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : ep.status === "approved" ? (
                          <CheckCircle className="h-4 w-4 text-emerald-400" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {episodes.length === 0 && !adding && (
              <div className="text-center py-8 text-muted-foreground">
                <FileAudio className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No episodes yet. Add your first episode below.</p>
              </div>
            )}

            {/* Add episode form */}
            {adding ? (
              <Card className="border-primary/20">
                <CardContent className="p-4 space-y-3">
                  {/* File upload — primary action */}
                  <div>
                    <Label>Audio / Video File *</Label>
                    <div
                      className="mt-1.5 border-2 border-dashed border-border/40 rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <div className="flex flex-col items-center gap-2 w-full">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">
                            {uploadProgress !== null ? `Uploading… ${uploadProgress}%` : "Reading metadata…"}
                          </p>
                          {uploadProgress !== null && (
                            <div className="w-full bg-secondary rounded-full h-1.5">
                              <div className="bg-primary h-1.5 rounded-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                            </div>
                          )}
                        </div>
                      ) : form.audioUrl ? (
                        <div className="flex flex-col items-center gap-1">
                          {form.mediaType === "video"
                            ? <Video className="h-6 w-6 text-emerald-400" />
                            : <Music className="h-6 w-6 text-emerald-400" />}
                          <p className="text-sm font-medium text-emerald-400">
                            {form.mediaType === "video" ? "Video" : "Audio"} uploaded
                          </p>
                          {form.duration && <p className="text-xs text-muted-foreground">Duration: {form.duration}</p>}
                          <p className="text-xs text-muted-foreground mt-1">Click to replace</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="h-6 w-6 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Click to upload MP3, M4A, WAV, or MP4</p>
                          <p className="text-[11px] text-muted-foreground">Duration auto-detected · Max 1 GB · S3 storage</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_FILE_INPUT}
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>

                  <div>
                    <Label>Episode Title *</Label>
                    <Input
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder={`Episode ${episodes.length + 1}`}
                    />
                    {form.audioUrl && !form.title && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">Title auto-filled from filename — edit if needed</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Duration</Label>
                      <Input
                        value={form.duration}
                        onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                        placeholder="Auto-detected"
                        readOnly={!!form.audioUrl && !!form.duration}
                        className={form.audioUrl && form.duration ? "bg-muted/50" : ""}
                      />
                    </div>
                    <div>
                      <Label>Chapter Price (coins)</Label>
                      <Input
                        value={form.chapter_price}
                        onChange={e => setForm(f => ({ ...f, chapter_price: e.target.value }))}
                        placeholder={`Default: ${DEFAULT_CHAPTER_PRICE}`}
                        type="number"
                        min="1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Default: {DEFAULT_CHAPTER_PRICE} coins ≈ ৳{(DEFAULT_CHAPTER_PRICE * 0.05).toFixed(0)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button onClick={saveEpisode} disabled={addMutation.isPending || uploading || !form.audioUrl} className="flex-1">
                      {addMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save Episode"}
                    </Button>
                    <Button variant="outline" onClick={() => { setAdding(false); setForm({ title: "", duration: "", chapter_price: "", audioUrl: "", mediaType: "audio" }); }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="p-4 border border-dashed border-border/40 rounded-lg text-center">
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add Episode
                </Button>
                <p className="text-[10px] text-muted-foreground mt-2">MP3 · M4A · WAV · MP4 video · drag to reorder</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
