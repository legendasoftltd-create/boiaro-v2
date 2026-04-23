import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Loader2, Lock, FileAudio, Music, Pencil, Trash2, Unlock, CheckCircle, Video, GripVertical, AlertTriangle, Coins } from "lucide-react";
import { toast } from "sonner";

interface AudiobookEpisodeManagerProps {
  bookFormatId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_CHAPTER_PRICE = 100;

export function AudiobookEpisodeManager({ bookFormatId, bookTitle, open, onOpenChange }: AudiobookEpisodeManagerProps) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<{ id: string; title: string; chapter_price: string } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const [form, setForm] = useState({ title: "", duration: "", chapter_price: "" });
  const touchState = useRef<{ idx: number; startY: number } | null>(null);

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
      setForm({ title: "", duration: "", chapter_price: "" });
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

  const togglePreviewMutation = trpc.books.toggleTrackPreview.useMutation({
    onSuccess: () => invalidate(),
  });

  const reorderMutation = trpc.books.reorderAudiobookTracks.useMutation({
    onSuccess: () => { invalidate(); },
    onError: () => { invalidate(); toast.error("Reorder failed"); },
  });

  const saveEpisode = () => {
    if (!form.title.trim()) { toast.error("Episode title is required"); return; }
    addMutation.mutate({
      bookFormatId,
      title: form.title.trim(),
      duration: form.duration || undefined,
      chapterPrice: form.chapter_price ? Number(form.chapter_price) : undefined,
    });
  };

  const handleDragStart = useCallback((idx: number) => { setDragIdx(idx); }, []);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx); }, []);

  const handleDragEnd = useCallback(async () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null); setOverIdx(null); return;
    }
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

  const totalChapterCoinPrice = episodes.reduce((sum, ep) => {
    if (ep.is_preview) return sum;
    return sum + (ep.chapter_price ?? DEFAULT_CHAPTER_PRICE);
  }, 0);
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
                  <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 rounded px-2 py-1 mt-1">
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

            {episodes.length > 0 && (
              <div className="space-y-0">
                <div className="grid grid-cols-[2rem_2rem_1fr_5rem_4.5rem_4.5rem_auto] items-center gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/30">
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
                      className={`grid grid-cols-[2rem_2rem_1fr_5rem_4.5rem_4.5rem_auto] items-center gap-2 px-3 py-2.5 border-b transition-all duration-150 ${
                        isDragging ? "opacity-40 border-primary/40 bg-primary/5" : isOver ? "border-primary border-dashed bg-primary/5" : "border-border/10 hover:bg-secondary/30"
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
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input value={editingEpisode.title} onChange={e => setEditingEpisode({ ...editingEpisode, title: e.target.value })} className="h-7 text-sm" placeholder="Episode title" />
                              <Input value={editingEpisode.chapter_price} onChange={e => setEditingEpisode({ ...editingEpisode, chapter_price: e.target.value })} className="h-7 text-sm w-24" placeholder={String(DEFAULT_CHAPTER_PRICE)} type="number" min="1" />
                            </div>
                            <div className="flex gap-2">
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
                              {ep.audio_url && (
                                <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary">
                                  {ep.media_type === "video"
                                    ? <><Video className="h-2.5 w-2.5 mr-0.5" />Video</>
                                    : <><Music className="h-2.5 w-2.5 mr-0.5" />Audio</>
                                  }
                                </Badge>
                              )}
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
                        {ep.is_preview ? (
                          <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400">✓</Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!locked && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => submitMutation.mutate({ trackId: ep.id })} disabled={submitMutation.isPending}>
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
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {episodes.length === 0 && !adding && (
              <div className="text-center py-6 text-muted-foreground">
                <FileAudio className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No episodes yet. Add your first episode below.</p>
              </div>
            )}

            {adding ? (
              <Card className="border-border/30">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <Label>Episode Title *</Label>
                    <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={`Episode ${episodes.length + 1}`} />
                  </div>
                  <div>
                    <Label>Chapter Price (coins)</Label>
                    <Input value={form.chapter_price} onChange={e => setForm(f => ({ ...f, chapter_price: e.target.value }))} placeholder={`Default: ${DEFAULT_CHAPTER_PRICE}`} type="number" min="1" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank for default ({DEFAULT_CHAPTER_PRICE} coins ≈ ৳{(DEFAULT_CHAPTER_PRICE * 0.05).toFixed(0)})</p>
                  </div>
                  <div>
                    <Label>Duration</Label>
                    <Input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g. 45:30" />
                  </div>
                  <p className="text-xs text-muted-foreground">Audio/video file upload available in Phase 5 (storage provider pending)</p>
                  <div className="flex gap-2">
                    <Button onClick={saveEpisode} disabled={addMutation.isPending} className="flex-1">
                      {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Episode"}
                    </Button>
                    <Button variant="outline" onClick={() => { setAdding(false); setForm({ title: "", duration: "", chapter_price: "" }); }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-2 p-4 border border-dashed border-border/40 rounded-lg text-center">
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add Episode
                </Button>
                <p className="text-[10px] text-muted-foreground mt-2">Drag to reorder episodes</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
