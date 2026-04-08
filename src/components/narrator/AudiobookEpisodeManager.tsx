import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Upload, Loader2, Lock, FileAudio, Music, Pencil, Trash2, Unlock, CheckCircle, Video, GripVertical, AlertTriangle, Coins } from "lucide-react";
import { toast } from "sonner";
import { validateMediaFile, sanitizeTrackTitle, ACCEPTED_FILE_INPUT, type MediaType } from "@/lib/audioValidation";

interface AudiobookEpisodeManagerProps {
  bookFormatId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Episode {
  id: string;
  title: string;
  audio_url: string | null;
  track_number: number;
  duration: string | null;
  is_preview: boolean | null;
  status: string;
  created_by: string | null;
  created_at: string;
  chapter_price: number | null;
}

const DEFAULT_CHAPTER_PRICE = 100; // coins

export function AudiobookEpisodeManager({ bookFormatId, bookTitle, open, onOpenChange }: AudiobookEpisodeManagerProps) {
  const { user } = useAuth();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<{ id: string; title: string; chapter_price: string } | null>(null);
  const [reordering, setReordering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: "", audio_url: "", duration: "", chapter_price: "" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [fullAudiobookPrice, setFullAudiobookPrice] = useState<number | null>(null);

  const loadEpisodes = async () => {
    const { data } = await supabase
      .from("audiobook_tracks")
      .select("*")
      .eq("book_format_id", bookFormatId)
      .order("track_number");
    setEpisodes((data as Episode[]) || []);
  };

  const loadFullPrice = async () => {
    const { data } = await supabase
      .from("book_formats")
      .select("price")
      .eq("id", bookFormatId)
      .maybeSingle();
    if (data) setFullAudiobookPrice(Number(data.price) || 0);
  };

  useEffect(() => {
    if (open && bookFormatId) {
      loadEpisodes();
      loadFullPrice();
    }
  }, [open, bookFormatId]);

  // Admin validation: total chapter price vs full audiobook price
  const totalChapterCoinPrice = episodes.reduce((sum, ep) => {
    if (ep.is_preview) return sum;
    return sum + (ep.chapter_price ?? DEFAULT_CHAPTER_PRICE);
  }, 0);

  const totalChapterBDT = totalChapterCoinPrice * 0.05; // coin_conversion_ratio
  const priceWarning = fullAudiobookPrice !== null && fullAudiobookPrice > 0 && totalChapterBDT < fullAudiobookPrice;

  const [uploadedMediaType, setUploadedMediaType] = useState<MediaType>("audio");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = await validateMediaFile(file);
    if (validation.valid === false) {
      toast.error(validation.error);
      return;
    }

    setUploadingFile(true);
    const { file: validatedFile, durationLabel, mediaType, mimeType } = validation.data;
    const name = sanitizeTrackTitle(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
    const path = `${bookFormatId}/${Date.now()}-${episodes.length + 1}.${ext}`;

    const { error } = await supabase.storage.from("audiobooks").upload(path, validatedFile, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      toast.error(error.message);
      setUploadingFile(false);
      return;
    }

    setUploadedMediaType(mediaType);
    setForm(f => ({
      ...f,
      audio_url: path,
      duration: durationLabel,
      title: f.title || name,
    }));
    setUploadingFile(false);
    toast.success(`${mediaType === "video" ? "Video" : "Audio"} file uploaded`);
  };

  const saveEpisode = async () => {
    if (!user || !form.title.trim()) {
      toast.error("Episode title is required");
      return;
    }
    if (!form.audio_url) {
      toast.error("Please upload an audio file");
      return;
    }
    setSaving(true);
    const nextOrder = episodes.length + 1;
    const chapterPrice = form.chapter_price ? Number(form.chapter_price) : null;

    const { error } = await supabase.from("audiobook_tracks").insert({
      book_format_id: bookFormatId,
      title: form.title.trim(),
      audio_url: form.audio_url,
      track_number: nextOrder,
      duration: form.duration || null,
      is_preview: nextOrder === 1,
      status: "draft",
      created_by: user.id,
      media_type: uploadedMediaType,
      chapter_price: chapterPrice,
    } as any);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setAdding(false);
    setForm({ title: "", audio_url: "", duration: "", chapter_price: "" });
    toast.success(`Episode ${nextOrder} added`);
    loadEpisodes();
  };

  const submitEpisode = async (ep: Episode) => {
    await supabase.from("audiobook_tracks").update({ status: "pending" }).eq("id", ep.id);
    toast.success("Episode submitted for review");
    loadEpisodes();
  };

  const deleteEpisode = async (ep: Episode) => {
    if (ep.status !== "draft") return;
    if (ep.audio_url) {
      await supabase.storage.from("audiobooks").remove([ep.audio_url]);
    }
    await supabase.from("audiobook_tracks").delete().eq("id", ep.id);
    toast.success("Episode deleted");
    loadEpisodes();
  };

  const updateEpisode = async (id: string, title: string, chapterPrice: string, status: string) => {
    if (status !== "draft") return;
    const price = chapterPrice ? Number(chapterPrice) : null;
    await supabase.from("audiobook_tracks").update({ title, chapter_price: price } as any).eq("id", id);
    setEditingEpisode(null);
    toast.success("Episode updated");
    loadEpisodes();
  };

  const togglePreview = async (ep: Episode) => {
    if (ep.status !== "draft") return;
    await supabase.from("audiobook_tracks").update({ is_preview: !ep.is_preview }).eq("id", ep.id);
    loadEpisodes();
  };

  // --- Drag & Drop reorder ---
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  }, []);

  const handleDragEnd = useCallback(async () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }

    const reordered = [...episodes];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(overIdx, 0, moved);

    const updatedEpisodes = reordered.map((ep, i) => ({ ...ep, track_number: i + 1 }));
    setEpisodes(updatedEpisodes);
    setDragIdx(null);
    setOverIdx(null);

    setReordering(true);
    try {
      const updates = updatedEpisodes.map(ep =>
        supabase.from("audiobook_tracks").update({ track_number: ep.track_number }).eq("id", ep.id)
      );
      await Promise.all(updates);
      toast.success("ক্রম আপডেট হয়েছে");
    } catch {
      toast.error("Reorder failed");
      loadEpisodes();
    }
    setReordering(false);
  }, [dragIdx, overIdx, episodes]);

  // --- Touch drag support ---
  const touchState = useRef<{ idx: number; startY: number } | null>(null);

  const handleTouchStart = useCallback((idx: number, e: React.TouchEvent) => {
    touchState.current = { idx, startY: e.touches[0].clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchState.current) return;
    const y = e.touches[0].clientY;
    const items = document.querySelectorAll("[data-ep-idx]");
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        setOverIdx(i);
        break;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (touchState.current && overIdx !== null) {
      setDragIdx(touchState.current.idx);
      const from = touchState.current.idx;
      const to = overIdx;
      touchState.current = null;

      if (from === to) { setOverIdx(null); return; }

      const reordered = [...episodes];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);

      const updatedEpisodes = reordered.map((ep, i) => ({ ...ep, track_number: i + 1 }));
      setEpisodes(updatedEpisodes);
      setDragIdx(null);
      setOverIdx(null);

      setReordering(true);
      try {
        const updates = updatedEpisodes.map(ep =>
          supabase.from("audiobook_tracks").update({ track_number: ep.track_number }).eq("id", ep.id)
        );
        await Promise.all(updates);
        toast.success("ক্রম আপডেট হয়েছে");
      } catch {
        toast.error("Reorder failed");
        loadEpisodes();
      }
      setReordering(false);
    } else {
      touchState.current = null;
      setOverIdx(null);
    }
  }, [overIdx, episodes]);

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

        {/* Admin pricing summary */}
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
                Full audiobook price (৳{fullAudiobookPrice}) is higher than total chapter value (≈ ৳{totalChapterBDT.toFixed(0)}). Users will prefer buying chapters individually.
              </div>
            )}
          </div>
        )}

        {reordering && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> সংরক্ষণ হচ্ছে...
          </div>
        )}

        {episodes.length > 0 && (
          <div className="space-y-0">
            {/* Table header */}
            <div className="grid grid-cols-[2rem_2rem_1fr_5rem_4.5rem_4.5rem_auto] items-center gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/30">
              <span></span>
              <span>#</span>
              <span>Title</span>
              <span>Duration</span>
              <span>Price</span>
              <span>Preview</span>
              <span>Actions</span>
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
                  {/* Drag handle */}
                  <div className="flex-shrink-0">
                    {!locked && <GripVertical className="h-4 w-4 text-muted-foreground touch-none" />}
                  </div>

                  {/* Track number */}
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {ep.track_number}
                  </div>

                  {/* Title + status */}
                  <div className="min-w-0">
                    {editingEpisode?.id === ep.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={editingEpisode.title}
                            onChange={e => setEditingEpisode({ ...editingEpisode, title: e.target.value })}
                            className="h-7 text-sm"
                            placeholder="Episode title"
                          />
                          <Input
                            value={editingEpisode.chapter_price}
                            onChange={e => setEditingEpisode({ ...editingEpisode, chapter_price: e.target.value })}
                            className="h-7 text-sm w-24"
                            placeholder={String(DEFAULT_CHAPTER_PRICE)}
                            type="number"
                            min="1"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7" onClick={() => updateEpisode(ep.id, editingEpisode.title, editingEpisode.chapter_price, ep.status)}>Save</Button>
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
                              {(ep as any).media_type === "video"
                                ? <><Video className="h-2.5 w-2.5 mr-0.5" />Video</>
                                : <><Music className="h-2.5 w-2.5 mr-0.5" />Audio</>
                              }
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-muted-foreground truncate">{ep.duration || "—"}</span>

                  {/* Price column */}
                  <div
                    className={`text-xs font-medium flex items-center gap-0.5 ${!locked ? "cursor-pointer hover:text-primary" : ""}`}
                    onClick={() => !locked && !editingEpisode && setEditingEpisode({ id: ep.id, title: ep.title, chapter_price: ep.chapter_price ? String(ep.chapter_price) : "" })}
                    title={!locked ? "Click to edit price" : undefined}
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

                  {/* Preview toggle */}
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
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => submitEpisode(ep)}>
                          Submit
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => togglePreview(ep)} title={ep.is_preview ? "Remove preview" : "Set as preview"}>
                          {ep.is_preview ? <Unlock className="h-3 w-3 text-emerald-400" /> : <Lock className="h-3 w-3" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingEpisode({ id: ep.id, title: ep.title, chapter_price: ep.chapter_price ? String(ep.chapter_price) : "" })}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteEpisode(ep)}>
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
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={`Episode ${episodes.length + 1}`}
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
                <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank for default ({DEFAULT_CHAPTER_PRICE} coins ≈ ৳{(DEFAULT_CHAPTER_PRICE * 0.05).toFixed(0)})</p>
              </div>
              <div>
                <Label>Media File (MP3 / M4A / MP4) *</Label>
                <input ref={fileRef} type="file" accept={ACCEPTED_FILE_INPUT} className="hidden" onChange={handleFileUpload} />
                <div className="flex items-center gap-3 mt-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadingFile}>
                    {uploadingFile ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload File</>}
                  </Button>
                  {form.audio_url && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {uploadedMediaType === "video" ? "Video" : "Audio"} uploaded {form.duration && `• ${form.duration}`}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Audio: max 100MB • Video: max 500MB</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveEpisode} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Episode"}
                </Button>
                <Button variant="outline" onClick={() => { setAdding(false); setForm({ title: "", audio_url: "", duration: "", chapter_price: "" }); }}>
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
            <p className="text-[10px] text-muted-foreground mt-2">ড্র্যাগ করে এপিসোডের ক্রম পরিবর্তন করুন</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
