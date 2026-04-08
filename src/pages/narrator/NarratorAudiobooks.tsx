import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic2, Plus, Upload, Loader2, Pencil, Image, Music, Send, Link2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachToExistingBook } from "@/components/book-submission/AttachToExistingBook";
import { VendorEarningsPreview } from "@/components/vendor/VendorEarningsPreview";
import { AudiobookEpisodeManager } from "@/components/narrator/AudiobookEpisodeManager";
import { useContentEditRequest } from "@/hooks/useContentEditRequest";

export default function NarratorAudiobooks() {
  const { user } = useAuth();
  const { submitEditRequest } = useContentEditRequest();
  const [books, setBooks] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [editBook, setEditBook] = useState<any>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [selectedBookTitle, setSelectedBookTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  // Attach flow
  const [mode, setMode] = useState<"choose" | "create" | "attach" | "attach-form">("choose");
  const [attachedBook, setAttachedBook] = useState<{ id: string; title: string; cover_url: string | null } | null>(null);
  const [form, setForm] = useState({
    title: "", title_en: "", description: "", category_id: "", cover_url: "",
    language: "bn", price: "", duration: "", audio_quality: "standard",
  });

  const load = async () => {
    if (!user) return;
    const { data: ownBooks } = await supabase
      .from("books")
      .select("*, categories(name, name_bn), book_formats(id, format, price, duration, audio_quality, submitted_by)")
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false });

    const { data: contribData } = await supabase
      .from("book_contributors")
      .select("book_id")
      .eq("user_id", user.id)
      .eq("role", "narrator");

    const contribBookIds = (contribData || []).map(c => c.book_id);
    const ownBookIds = (ownBooks || []).map(b => b.id);
    const extraIds = contribBookIds.filter(id => !ownBookIds.includes(id));

    let allBooks = ownBooks || [];
    if (extraIds.length > 0) {
      const { data: extraBooks } = await supabase
        .from("books")
        .select("*, categories(name, name_bn), book_formats(id, format, price, duration, audio_quality, submitted_by)")
        .in("id", extraIds);
      allBooks = [...allBooks, ...(extraBooks || [])];
    }

    setBooks(allBooks);
    const { data: cats } = await supabase.from("categories").select("id, name, name_bn");
    setCategories(cats || []);
  };

  useEffect(() => { load(); }, [user]);

  const filteredBooks = filter === "all" ? books : books.filter(b => b.submission_status === filter);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const ext = file.name.split(".").pop();
    const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("book-covers").upload(path, file);
    if (error) { toast.error(error.message); setUploadingCover(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("book-covers").getPublicUrl(path);
    setForm(f => ({ ...f, cover_url: publicUrl }));
    setUploadingCover(false);
  };


  const openNew = () => {
    setEditBook(null);
    setAttachedBook(null);
    setMode("choose");
    setForm({ title: "", title_en: "", description: "", category_id: "", cover_url: "", language: "bn", price: "", duration: "", audio_quality: "standard" });
    setOpen(true);
  };

  const openEdit = (book: any) => {
    setEditBook(book);
    setAttachedBook(null);
    setMode("create");
    const fmt = (book.book_formats || []).find((f: any) => f.format === "audiobook");
    setForm({
      title: book.title || "", title_en: book.title_en || "",
      description: book.description || "", category_id: book.category_id || "",
      cover_url: book.cover_url || "", language: book.language || "bn",
      price: fmt?.price?.toString() || "", duration: fmt?.duration || "",
      audio_quality: fmt?.audio_quality || "standard",
    });
    setOpen(true);
  };

  const handleAttachSelect = (book: { id: string; title: string; cover_url: string | null }) => {
    setAttachedBook(book);
    setMode("attach-form");
    setForm(f => ({ ...f, price: "", duration: "", audio_quality: "standard" }));
  };

  const saveAttachFormat = async () => {
    if (!user || !attachedBook) return;
    setUploading(true);

    const formatPayload = {
      book_id: attachedBook.id,
      format: "audiobook" as const,
      price: form.price ? Number(form.price) : 0,
      duration: form.duration || null,
      audio_quality: (form.audio_quality || "standard") as "standard" | "hd",
      submission_status: "pending",
      submitted_by: user.id,
    };

    const { error: fmtError } = await supabase.from("book_formats").insert(formatPayload);
    if (fmtError) {
      if (fmtError.message.includes("duplicate") || fmtError.message.includes("unique")) {
        toast.error("This book already has an audiobook format");
      } else {
        toast.error(fmtError.message);
      }
      setUploading(false);
      return;
    }

    await supabase.from("book_contributors").insert({
      book_id: attachedBook.id, user_id: user.id, role: "narrator", format: "audiobook",
    });

    setUploading(false);
    setOpen(false);
    toast.success("Audiobook format attached and submitted for review");
    load();
  };

  const save = async (asDraft = false) => {
    if (!user || !form.title) { toast.error("Title is required"); return; }
    setUploading(true);
    const slug = form.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u0980-\u09FF-]/g, "");

    const bookPayload = {
      title: form.title, title_en: form.title_en || null, slug,
      description: form.description || null, category_id: form.category_id || null,
      cover_url: form.cover_url || null, language: form.language,
      submission_status: asDraft ? "draft" : "pending", submitted_by: user.id,
    };

    let bookId: string;
    if (editBook) {
      // If content is approved/pending → submit edit request
      if (editBook.submission_status && editBook.submission_status !== "draft") {
        const audioFmt = (editBook.book_formats || []).find((f: any) => f.format === "audiobook");
        const success = await submitEditRequest({
          contentType: "book",
          contentId: editBook.id,
          submittedBy: user.id,
          proposedChanges: {
            book: bookPayload,
            format: {
              price: form.price ? Number(form.price) : 0,
              duration: form.duration || null,
              audio_quality: (form.audio_quality || "standard"),
              format_id: audioFmt?.id,
            },
          },
        });
        setUploading(false);
        if (success) setOpen(false);
        return;
      }
      const { error } = await supabase.from("books").update(bookPayload).eq("id", editBook.id);
      if (error) { toast.error(error.message); setUploading(false); return; }
      bookId = editBook.id;
    } else {
      const { data, error } = await supabase.from("books").insert(bookPayload).select("id").single();
      if (error) { toast.error(error.message); setUploading(false); return; }
      bookId = data.id;
      await supabase.from("book_contributors").insert({ book_id: bookId, user_id: user.id, role: "narrator", format: "audiobook" });
    }

    const existingFmt = editBook?.book_formats?.find((f: any) => f.format === "audiobook");
    const formatPayload = {
      book_id: bookId, format: "audiobook" as const,
      price: form.price ? Number(form.price) : 0,
      duration: form.duration || null, audio_quality: (form.audio_quality || "standard") as "standard" | "hd",
    };

    if (existingFmt) {
      await supabase.from("book_formats").update(formatPayload).eq("id", existingFmt.id);
    } else {
      await supabase.from("book_formats").insert(formatPayload);
    }

    setUploading(false);
    setOpen(false);
    toast.success(asDraft ? "Saved as draft" : editBook ? "Updated" : "Submitted for review");
    load();
  };

  const submitForReview = async (book: any) => {
    await supabase.from("books").update({ submission_status: "pending" }).eq("id", book.id);
    toast.success("Submitted for review");
    load();
  };

  const openTrackManager = (book: any) => {
    const fmt = (book.book_formats || []).find((f: any) => f.format === "audiobook");
    if (!fmt) { toast.error("Save audiobook format first"); return; }
    setSelectedFormatId(fmt.id);
    setSelectedBookTitle(book.title);
    setTracksOpen(true);
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

  const statusCounts = {
    all: books.length,
    draft: books.filter(b => b.submission_status === "draft").length,
    pending: books.filter(b => b.submission_status === "pending").length,
    approved: books.filter(b => b.submission_status === "approved").length,
    rejected: books.filter(b => b.submission_status === "rejected").length,
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

      {filteredBooks.length > 0 ? (
        <div className="grid gap-3">
          {filteredBooks.map(book => (
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
                  <p className="text-xs text-muted-foreground">{book.categories?.name_bn || book.categories?.name || "No category"}</p>
                  {book.book_formats?.find((f: any) => f.format === "audiobook") && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ৳{book.book_formats.find((f: any) => f.format === "audiobook")?.price || 0}
                      {book.book_formats.find((f: any) => f.format === "audiobook")?.duration && ` • ${book.book_formats.find((f: any) => f.format === "audiobook").duration}`}
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
                    <Button size="sm" onClick={() => submitForReview(book)} className="gap-1 text-xs h-8 bg-primary">
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

      {/* Submit/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editBook ? "Edit Audiobook" : mode === "attach" ? "Attach to Existing Book" : mode === "attach-form" ? "Attach Audiobook Format" : mode === "create" ? "New Audiobook" : "New Audiobook"}
            </DialogTitle>
          </DialogHeader>

          {/* Choose mode */}
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

          {/* Attach search */}
          {mode === "attach" && <AttachToExistingBook format="audiobook" onSelect={handleAttachSelect} onCancel={() => setMode("choose")} />}

          {/* Attach format form */}
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
              <Button className="w-full" onClick={saveAttachFormat} disabled={uploading}>
                {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Attaching...</> : "Attach & Submit for Review"}
              </Button>
            </div>
          )}

          {/* Create / Edit form */}
          {mode === "create" && (
            <>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Cover Image</Label>
              <div className="flex items-center gap-4 mt-1.5">
                {form.cover_url && <img src={form.cover_url} alt="" className="w-16 h-24 object-cover rounded-lg border border-border/30" />}
                <div>
                  <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                  <Button type="button" variant="outline" size="sm" onClick={() => coverRef.current?.click()} disabled={uploadingCover}>
                    {uploadingCover ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload Cover</>}
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
                <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_bn || c.name}</SelectItem>)}</SelectContent>
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
            <Button variant="outline" className="flex-1" onClick={() => save(true)} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}
            </Button>
            <Button className="flex-1" onClick={() => save(false)} disabled={uploading}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : editBook ? "Update & Submit" : "Submit for Review"}
            </Button>
          </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Episodes Manager */}
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
