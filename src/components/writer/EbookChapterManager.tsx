import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Loader2, BookOpen, Lock, FileText, Hash, Upload, Check } from "lucide-react";
import { toast } from "sonner";

interface EbookChapterManagerProps {
  bookFormatId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_BASE}/upload/media`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err.error || "Upload failed");
  }
  const data = await res.json() as { url: string };
  return data.url;
}

export function EbookChapterManager({ bookFormatId, bookTitle, open, onOpenChange }: EbookChapterManagerProps) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", fileUrl: "" });
  const [uploading, setUploading] = useState(false);
  const [uploadingForTrack, setUploadingForTrack] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: chapters = [], isLoading } = trpc.books.ebookChapters.useQuery(
    { bookFormatId },
    { enabled: open && !!bookFormatId }
  );

  const addMutation = trpc.books.addEbookChapter.useMutation({
    onSuccess: () => {
      utils.books.ebookChapters.invalidate({ bookFormatId });
      setAdding(false);
      setForm({ title: "", content: "", fileUrl: "" });
      toast.success(`Chapter ${chapters.length + 1} added`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.books.updateEbookChapter.useMutation({
    onSuccess: () => {
      utils.books.ebookChapters.invalidate({ bookFormatId });
      toast.success("File attached to chapter");
    },
    onError: (err) => toast.error(err.message),
  });

  const submitMutation = trpc.books.submitEbookChapter.useMutation({
    onSuccess: () => { utils.books.ebookChapters.invalidate({ bookFormatId }); toast.success("Chapter submitted for review"); },
  });

  const deleteMutation = trpc.books.deleteEbookChapter.useMutation({
    onSuccess: () => { utils.books.ebookChapters.invalidate({ bookFormatId }); toast.success("Chapter deleted"); },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setForm(f => ({ ...f, fileUrl: url }));
      toast.success("File uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTrackFileSelect = async (chapterId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingForTrack(chapterId);
    try {
      const url = await uploadFile(file);
      updateMutation.mutate({ chapterId, fileUrl: url });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingForTrack(null);
    }
  };

  const saveChapter = () => {
    if (!form.title.trim()) { toast.error("Chapter title is required"); return; }
    addMutation.mutate({
      bookFormatId,
      title: form.title.trim(),
      content: form.content.trim() || undefined,
      fileUrl: form.fileUrl || undefined,
    });
  };

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
            <BookOpen className="h-5 w-5 text-primary" />
            Chapters — {bookTitle}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {chapters.length > 0 && (
              <div className="space-y-2">
                {chapters.map(ch => (
                  <div key={ch.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/20">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {ch.chapter_order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{ch.chapter_title}</p>
                        {isLocked(ch.status) && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {statusBadge(ch.status)}
                        {ch.file_url && (
                          <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary">
                            <FileText className="h-2.5 w-2.5 mr-0.5" />File
                          </Badge>
                        )}
                        {ch.content && (
                          <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary">
                            <Hash className="h-2.5 w-2.5 mr-0.5" />Text
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {ch.status === "draft" && (
                        <>
                          {/* Upload file to existing draft chapter */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={uploadingForTrack === ch.id || updateMutation.isPending}
                            onClick={() => trackFileRefs.current[ch.id]?.click()}
                          >
                            {uploadingForTrack === ch.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : ch.file_url ? <Check className="h-3 w-3 text-emerald-400" /> : <Upload className="h-3 w-3" />}
                            {ch.file_url ? "Replace" : "Upload"}
                          </Button>
                          <input
                            type="file"
                            accept=".epub,.pdf,application/epub+zip,application/pdf"
                            className="hidden"
                            ref={el => { trackFileRefs.current[ch.id] = el; }}
                            onChange={e => handleTrackFileSelect(ch.id, e)}
                          />
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => submitMutation.mutate({ chapterId: ch.id })} disabled={submitMutation.isPending}>
                            Submit
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteMutation.mutate({ chapterId: ch.id })} disabled={deleteMutation.isPending}>
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {chapters.length === 0 && !adding && (
              <div className="text-center py-6 text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No chapters yet. Add your first chapter below.</p>
              </div>
            )}

            {adding ? (
              <Card className="border-border/30">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <Label>Chapter Title *</Label>
                    <Input
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder={`Chapter ${chapters.length + 1}`}
                    />
                  </div>
                  <div>
                    <Label>Upload File (EPUB or PDF)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 text-sm"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? "Uploading…" : form.fileUrl ? "Replace File" : "Choose File"}
                      </Button>
                      {form.fileUrl && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 gap-1">
                          <Check className="h-3 w-3" /> File ready
                        </Badge>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".epub,.pdf,application/epub+zip,application/pdf"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">EPUB or PDF · max 500 MB</p>
                  </div>
                  <div>
                    <Label>Or paste chapter text (optional)</Label>
                    <Textarea
                      value={form.content}
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      rows={4}
                      placeholder="Write chapter content here…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveChapter} disabled={addMutation.isPending || uploading} className="flex-1">
                      {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Chapter"}
                    </Button>
                    <Button variant="outline" onClick={() => { setAdding(false); setForm({ title: "", content: "", fileUrl: "" }); }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-2 p-4 border border-dashed border-border/40 rounded-lg text-center">
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4 mr-2" />Add Chapter
                </Button>
                <p className="text-[10px] text-muted-foreground mt-2">Add chapters one at a time. EPUB/PDF upload supported.</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
