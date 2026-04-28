import { useState, type ChangeEvent } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic2, Plus, Loader2, Pencil, Image, Music, Send, Link2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachToExistingBook } from "@/components/book-submission/AttachToExistingBook";
import { VendorEarningsPreview } from "@/components/vendor/VendorEarningsPreview";
import { AudiobookEpisodeManager } from "@/components/narrator/AudiobookEpisodeManager";
import { useContentEditRequest } from "@/hooks/useContentEditRequest";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const MAX_COVER_SIZE = 5 * 1024 * 1024;

const emptyForm = () => ({
  title: "", title_en: "", description: "", category_id: "", cover_url: "",
  language: "bn", price: "", duration: "", audio_quality: "standard",
});

export default function NarratorAudiobooks() {
  const { submitEditRequest } = useContentEditRequest();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [editBook, setEditBook] = useState<any>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [selectedBookTitle, setSelectedBookTitle] = useState("");
  const [mode, setMode] = useState<"choose" | "create" | "attach" | "attach-form">("choose");
  const [attachedBook, setAttachedBook] = useState<{ id: string; title: string; cover_url: string | null } | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploadingCover, setUploadingCover] = useState(false);

  const { data: books = [], isLoading } = trpc.books.myCreatorBooks.useQuery({ role: "narrator" });
  const { data: categories = [] } = trpc.books.categories.useQuery();

  const submitMutation = trpc.books.submitBook.useMutation({
    onSuccess: () => { utils.books.myCreatorBooks.invalidate(); setOpen(false); toast.success("Submitted for review"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.books.updateBook.useMutation({
    onSuccess: () => { utils.books.myCreatorBooks.invalidate(); setOpen(false); toast.success("Updated"); },
    onError: (err) => toast.error(err.message),
  });
  const attachMutation = trpc.books.attachBookFormat.useMutation({
    onSuccess: () => { utils.books.myCreatorBooks.invalidate(); setOpen(false); toast.success("Audiobook format attached and submitted for review"); },
    onError: (err) => toast.error(err.message),
  });
  const submitForReviewMutation = trpc.books.submitBookForReview.useMutation({
    onSuccess: () => { utils.books.myCreatorBooks.invalidate(); toast.success("Submitted for review"); },
    onError: (err) => toast.error(err.message),
  });

  const isPending = submitMutation.isPending || updateMutation.isPending || attachMutation.isPending;

  const openNew = () => {
    setEditBook(null); setAttachedBook(null); setMode("choose"); setForm(emptyForm()); setOpen(true);
  };
  const openEdit = (book: any) => {
    setEditBook(book); setAttachedBook(null); setMode("create");
    const fmt = (book.formats || []).find((f: any) => f.format === "audiobook");
    setForm({ ...emptyForm(), title: book.title || "", description: book.description || "", cover_url: book.cover_url || "", price: fmt?.price?.toString() || "", duration: fmt?.duration || "", audio_quality: fmt?.audio_quality || "standard" });
    setOpen(true);
  };

  const uploadCover = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > MAX_COVER_SIZE) {
      toast.error("Cover must be under 5 MB");
      return;
    }
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any));
        throw new Error(err.error || response.statusText || "Upload failed");
      }
      const data = await response.json();
      setForm((f) => ({ ...f, cover_url: data.url || "" }));
      toast.success("Cover uploaded");
    } catch (error: any) {
      toast.error("Upload failed: " + (error.message || "Unknown error"));
    } finally {
      setUploadingCover(false);
    }
  };

  const save = async (asDraft = false) => {
    if (!form.title) { toast.error("Title is required"); return; }
    if (editBook) {
      if (editBook.submission_status !== "draft") {
        const fmt = (editBook.formats || []).find((f: any) => f.format === "audiobook");
        await submitEditRequest({ contentType: "book", contentId: editBook.id, submittedBy: "", proposedChanges: { book: form, format: { price: Number(form.price), duration: form.duration, audio_quality: form.audio_quality, format_id: fmt?.id } } });
        setOpen(false); return;
      }
      updateMutation.mutate({
        bookId: editBook.id, formatId: (editBook.formats || []).find((f: any) => f.format === "audiobook")?.id,
        title: form.title, titleEn: form.title_en || undefined, description: form.description || undefined,
        categoryId: form.category_id || undefined, coverUrl: form.cover_url || undefined,
        language: form.language, asDraft, format: "audiobook",
        price: form.price ? Number(form.price) : 0,
        duration: form.duration || undefined,
        audioQuality: (form.audio_quality || "standard") as "standard" | "hd",
      });
    } else {
      submitMutation.mutate({
        title: form.title, titleEn: form.title_en || undefined, description: form.description || undefined,
        categoryId: form.category_id || undefined, coverUrl: form.cover_url || undefined,
        language: form.language, asDraft, format: "audiobook", role: "narrator",
        price: form.price ? Number(form.price) : 0,
        duration: form.duration || undefined,
        audioQuality: (form.audio_quality || "standard") as "standard" | "hd",
      });
    }
  };

  const openTrackManager = (book: any) => {
    const fmt = (book.formats || []).find((f: any) => f.format === "audiobook");
    if (!fmt) { toast.error("Save audiobook format first"); return; }
    setSelectedFormatId(fmt.id);
    setSelectedBookTitle(book.title);
    setTracksOpen(true);
  };

  const filteredBooks = filter === "all" ? books : (books as any[]).filter((b: any) => b.submission_status === filter);
  const statusCounts = {
    all: books.length,
    draft: (books as any[]).filter((b: any) => b.submission_status === "draft").length,
    pending: (books as any[]).filter((b: any) => b.submission_status === "pending").length,
    approved: (books as any[]).filter((b: any) => b.submission_status === "approved").length,
    rejected: (books as any[]).filter((b: any) => b.submission_status === "rejected").length,
  };

  const statusBadge = (status: string) => {
    const config: Record<string, { cls: string; label: string }> = {
      draft: { cls: "bg-secondary text-muted-foreground border-border/30", label: "Draft" },
      pending: { cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "Pending Review" },
      approved: { cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Approved" },
      rejected: { cls: "bg-destructive/20 text-destructive border-destructive/30", label: "Rejected" },
    };
    const c = config[status] || config.pending;
    return <Badge variant="outline" className={`text-[10px] ${c.cls}`}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold">My Audiobooks</h1>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />New Audiobook</Button>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({statusCounts.draft})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({statusCounts.pending})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({statusCounts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({statusCounts.rejected})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (filteredBooks as any[]).length > 0 ? (
        <div className="grid gap-3">
          {(filteredBooks as any[]).map((book: any) => (
            <Card key={book.id} className="border-border/30 bg-card/60">
              <CardContent className="p-4 flex gap-4">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" className="w-16 h-24 object-cover rounded-lg" />
                ) : (
                  <div className="w-16 h-24 bg-muted rounded-lg flex items-center justify-center">
                    <Image className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{book.title}</h3>
                    {statusBadge(book.submission_status || "pending")}
                  </div>
                  <p className="text-xs text-muted-foreground">{book.category?.name_bn || book.category?.name || "No category"}</p>
                  {(book.formats || []).find((f: any) => f.format === "audiobook") && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ৳{(book.formats || []).find((f: any) => f.format === "audiobook")?.price || 0}
                      {(book.formats || []).find((f: any) => f.format === "audiobook")?.duration && ` • ${(book.formats || []).find((f: any) => f.format === "audiobook").duration}`}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(book.created_at).toLocaleDateString()}</p>
                </div>
                <div className="shrink-0 flex flex-col gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => openTrackManager(book)} className="gap-1 text-xs h-8">
                    <Music className="h-3 w-3" />Episodes
                  </Button>
                  {book.submission_status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(book)} className="gap-1 text-xs h-8">
                      <Pencil className="h-3 w-3" />Edit
                    </Button>
                  )}
                  {book.submission_status === "draft" && (
                    <Button size="sm" onClick={() => submitForReviewMutation.mutate({ bookId: book.id })} disabled={submitForReviewMutation.isPending} className="gap-1 text-xs h-8 bg-primary">
                      <Send className="h-3 w-3" />Submit
                    </Button>
                  )}
                  {book.submission_status && book.submission_status !== "draft" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEdit(book)} className="gap-1 text-xs h-8">
                        <Pencil className="h-3 w-3" />Request Edit
                      </Button>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        <span className="text-[10px]">Changes need approval</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/30 bg-card/60">
          <CardContent className="text-center py-10 text-muted-foreground">
            <Mic2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No audiobooks found. Click "New Audiobook" to start.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editBook ? "Edit Audiobook" : mode === "attach" ? "Attach to Existing Book" : mode === "attach-form" ? "Attach Audiobook Format" : "New Audiobook"}
            </DialogTitle>
          </DialogHeader>

          {mode === "choose" && !editBook && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground text-center">How would you like to add your audiobook?</p>
              <div className="grid grid-cols-2 gap-4">
                <Card className="border-border/30 hover:border-primary/50 cursor-pointer transition-colors" onClick={() => setMode("create")}>
                  <CardContent className="p-6 text-center space-y-2">
                    <Plus className="h-8 w-8 mx-auto text-primary" />
                    <h4 className="font-semibold text-sm">Create New Book</h4>
                    <p className="text-xs text-muted-foreground">Add a brand new book title</p>
                  </CardContent>
                </Card>
                <Card className="border-border/30 hover:border-primary/50 cursor-pointer transition-colors" onClick={() => setMode("attach")}>
                  <CardContent className="p-6 text-center space-y-2">
                    <Link2 className="h-8 w-8 mx-auto text-primary" />
                    <h4 className="font-semibold text-sm">Attach to Existing</h4>
                    <p className="text-xs text-muted-foreground">Add audiobook to an approved book</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {mode === "attach" && <AttachToExistingBook format="audiobook" onSelect={(b) => { setAttachedBook(b); setMode("attach-form"); }} onCancel={() => setMode("choose")} />}

          {mode === "attach-form" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/30 border border-border/30">
                {attachedBook?.cover_url && <img src={attachedBook.cover_url} alt="" className="w-10 h-14 object-cover rounded" />}
                <div>
                  <p className="font-medium text-sm">{attachedBook?.title}</p>
                  <Badge variant="outline" className="text-[9px] mt-1">Attaching audiobook format</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Original Price (৳)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
                <div><Label>Total Duration</Label><Input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g. 3h 45m" /></div>
                <div>
                  <Label>Audio Quality</Label>
                  <Select value={form.audio_quality} onValueChange={v => setForm(f => ({ ...f, audio_quality: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="hd">HD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {attachedBook && form.price && Number(form.price) > 0 && (
                <VendorEarningsPreview bookId={attachedBook.id} format="audiobook" basePrice={Number(form.price)} role="narrator" />
              )}
              <Button className="w-full" onClick={() => {
                if (!attachedBook) return;
                attachMutation.mutate({ bookId: attachedBook.id, format: "audiobook", role: "narrator", price: form.price ? Number(form.price) : 0, duration: form.duration || undefined, audioQuality: (form.audio_quality || "standard") as "standard" | "hd" });
              }} disabled={isPending}>
                {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Attaching...</> : "Attach & Submit for Review"}
              </Button>
            </div>
          )}

          {mode === "create" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Cover Image</Label>
                  <div className="mt-2 space-y-2">
                    {form.cover_url && (
                      <img src={form.cover_url} alt="Cover preview" className="w-16 h-24 object-cover rounded border border-border/40" />
                    )}
                    <div className="flex items-center gap-2">
                      <Input value={form.cover_url} onChange={e => setForm(f => ({ ...f, cover_url: e.target.value }))} placeholder="https://..." />
                      <Button type="button" variant="outline" className="shrink-0" disabled={uploadingCover}>
                        <label className="cursor-pointer flex items-center gap-2">
                          {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                          Upload
                          <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={uploadCover} />
                        </label>
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="col-span-2"><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div><Label>Title (English)</Label><Input value={form.title_en} onChange={e => setForm(f => ({ ...f, title_en: e.target.value }))} /></div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(categories as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name_bn || c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
                <div><Label>Original Price (৳)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
                <div><Label>Total Duration</Label><Input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g. 3h 45m" /></div>
                <div>
                  <Label>Audio Quality</Label>
                  <Select value={form.audio_quality} onValueChange={v => setForm(f => ({ ...f, audio_quality: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="hd">HD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editBook && form.price && Number(form.price) > 0 && (
                <VendorEarningsPreview bookId={editBook.id} format="audiobook" basePrice={Number(form.price)} role="narrator" />
              )}
              <div className="flex gap-3 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => save(true)} disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}
                </Button>
                <Button className="flex-1" onClick={() => save(false)} disabled={isPending}>
                  {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : editBook ? "Update & Submit" : "Submit for Review"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {selectedFormatId && (
        <AudiobookEpisodeManager
          bookFormatId={selectedFormatId}
          bookTitle={selectedBookTitle}
          open={tracksOpen}
          onOpenChange={setTracksOpen}
        />
      )}
    </div>
  );
}
