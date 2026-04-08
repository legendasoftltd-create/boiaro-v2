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
import { BookOpen, Plus, Upload, Loader2, Pencil, Image, Link2, Layers, Lock } from "lucide-react";
import { toast } from "sonner";
import { EbookChapterManager } from "@/components/writer/EbookChapterManager";
import { useCreatorPermissions } from "@/hooks/useCreatorPermissions";
import { AttachToExistingBook } from "@/components/book-submission/AttachToExistingBook";
import { VendorEarningsPreview } from "@/components/vendor/VendorEarningsPreview";
import { useContentEditRequest } from "@/hooks/useContentEditRequest";

export default function WriterBooks() {
  const { user } = useAuth();
  const { canAddFormat } = useCreatorPermissions();
  const { submitEditRequest } = useContentEditRequest();
  const [books, setBooks] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editBook, setEditBook] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [selectedBookTitle, setSelectedBookTitle] = useState("");

  // Attach flow state
  const [mode, setMode] = useState<"choose" | "create" | "attach" | "attach-form">("choose");
  const [attachedBook, setAttachedBook] = useState<{ id: string; title: string; cover_url: string | null } | null>(null);

  const [form, setForm] = useState({
    title: "", title_en: "", description: "", description_bn: "",
    category_id: "", cover_url: "", language: "bn", tags: "",
    price: "", pages: "", chapters_count: "", file_url: "", file_size: "",
  });

  const load = async () => {
    if (!user) return;
    // Load books submitted by this user AND books where they are a contributor
    const { data: ownBooks } = await supabase
      .from("books")
      .select("*, categories(name, name_bn), book_formats(id, format, price, submitted_by)")
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false });

    const { data: contribData } = await supabase
      .from("book_contributors")
      .select("book_id")
      .eq("user_id", user.id)
      .eq("role", "writer");

    const contribBookIds = (contribData || []).map(c => c.book_id);
    const ownBookIds = (ownBooks || []).map(b => b.id);
    const extraIds = contribBookIds.filter(id => !ownBookIds.includes(id));

    let allBooks = ownBooks || [];
    if (extraIds.length > 0) {
      const { data: extraBooks } = await supabase
        .from("books")
        .select("*, categories(name, name_bn), book_formats(id, format, price, submitted_by)")
        .in("id", extraIds);
      allBooks = [...allBooks, ...(extraBooks || [])];
    }

    setBooks(allBooks);
    const { data: cats } = await supabase.from("categories").select("id, name, name_bn");
    setCategories(cats || []);
  };

  useEffect(() => { load(); }, [user]);

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
    toast.success("Cover uploaded");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, bookId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const ext = file.name.split(".").pop();
    const path = `${bookId || "new"}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("ebooks").upload(path, file);
    if (error) { toast.error(error.message); setUploadingFile(false); return; }
    setForm(f => ({ ...f, file_url: path, file_size: `${(file.size / 1024 / 1024).toFixed(1)} MB` }));
    setUploadingFile(false);
    toast.success("eBook file uploaded");
  };

  const openNew = () => {
    setEditBook(null);
    setAttachedBook(null);
    setMode("choose");
    setForm({ title: "", title_en: "", description: "", description_bn: "", category_id: "", cover_url: "", language: "bn", tags: "", price: "", pages: "", chapters_count: "", file_url: "", file_size: "" });
    setOpen(true);
  };

  const openEdit = (book: any) => {
    setEditBook(book);
    setAttachedBook(null);
    setMode("create"); // editing existing = direct form
    const ebookFormat = (book.book_formats || []).find((f: any) => f.format === "ebook");
    setForm({
      title: book.title || "", title_en: book.title_en || "",
      description: book.description || "", description_bn: book.description_bn || "",
      category_id: book.category_id || "", cover_url: book.cover_url || "",
      language: book.language || "bn", tags: (book.tags || []).join(", "),
      price: ebookFormat?.price?.toString() || "", pages: "", chapters_count: "",
      file_url: ebookFormat?.file_url || "", file_size: "",
    });
    setOpen(true);
  };

  const handleAttachSelect = (book: { id: string; title: string; cover_url: string | null }) => {
    setAttachedBook(book);
    setMode("attach-form");
    setForm(f => ({ ...f, price: "", pages: "", chapters_count: "", file_url: "", file_size: "" }));
  };

  const saveAttachFormat = async () => {
    if (!user || !attachedBook) return;
    setUploading(true);

    const formatPayload = {
      book_id: attachedBook.id,
      format: "ebook" as const,
      price: form.price ? Number(form.price) : 0,
      pages: form.pages ? Number(form.pages) : null,
      chapters_count: form.chapters_count ? Number(form.chapters_count) : null,
      file_url: form.file_url || null,
      file_size: form.file_size || null,
      submission_status: "pending",
      submitted_by: user.id,
    };

    const { error: fmtError } = await supabase.from("book_formats").insert(formatPayload);
    if (fmtError) {
      if (fmtError.message.includes("duplicate") || fmtError.message.includes("unique")) {
        toast.error("This book already has an ebook format");
      } else {
        toast.error(fmtError.message);
      }
      setUploading(false);
      return;
    }

    await supabase.from("book_contributors").insert({
      book_id: attachedBook.id, user_id: user.id, role: "writer", format: "ebook",
    });

    setUploading(false);
    setOpen(false);
    toast.success("eBook format attached and submitted for review");
    load();
  };

  const save = async (asDraft = false) => {
    if (!user || !form.title) { toast.error("Title is required"); return; }
    setUploading(true);
    const slug = form.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u0980-\u09FF-]/g, "");

    const bookPayload = {
      title: form.title, title_en: form.title_en || null,
      slug, description: form.description || null,
      description_bn: form.description_bn || null,
      category_id: form.category_id || null, cover_url: form.cover_url || null,
      language: form.language, submission_status: asDraft ? "draft" : "pending", submitted_by: user.id,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : null,
    };

    let bookId: string;
    if (editBook) {
      // If content is approved/pending → submit edit request instead of direct update
      if (editBook.submission_status && editBook.submission_status !== "draft") {
        const ebookFormat = (editBook.book_formats || []).find((f: any) => f.format === "ebook");
        const formatChanges = {
          price: form.price ? Number(form.price) : 0,
          pages: form.pages ? Number(form.pages) : null,
          chapters_count: form.chapters_count ? Number(form.chapters_count) : null,
          file_url: form.file_url || null, file_size: form.file_size || null,
        };
        const success = await submitEditRequest({
          contentType: "book",
          contentId: editBook.id,
          submittedBy: user.id,
          proposedChanges: {
            book: bookPayload,
            format: { ...formatChanges, format_id: ebookFormat?.id },
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
      await supabase.from("book_contributors").insert({ book_id: bookId, user_id: user.id, role: "writer", format: "ebook" });
    }

    const existingFormat = editBook?.book_formats?.find((f: any) => f.format === "ebook");
    const formatPayload = {
      book_id: bookId, format: "ebook" as const,
      price: form.price ? Number(form.price) : 0,
      pages: form.pages ? Number(form.pages) : null,
      chapters_count: form.chapters_count ? Number(form.chapters_count) : null,
      file_url: form.file_url || null, file_size: form.file_size || null,
    };

    if (existingFormat) {
      await supabase.from("book_formats").update(formatPayload).eq("id", existingFormat.id);
    } else {
      await supabase.from("book_formats").insert(formatPayload);
    }

    setUploading(false);
    setOpen(false);
    toast.success(asDraft ? "Saved as draft" : editBook ? "Book updated" : "Book submitted for review");
    load();
  };

  const submitForReview = async (book: any) => {
    await supabase.from("books").update({ submission_status: "pending" }).eq("id", book.id);
    toast.success("Submitted for review");
    load();
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

  const renderChooseMode = () => (
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground text-center">How would you like to add your eBook?</p>
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
            <p className="text-xs text-muted-foreground">Add ebook format to an approved book</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderAttachForm = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/30 border border-border/30">
        {attachedBook?.cover_url && <img src={attachedBook.cover_url} alt="" className="w-10 h-14 object-cover rounded" />}
        <div>
          <p className="font-medium text-sm">{attachedBook?.title}</p>
          <Badge variant="outline" className="text-[9px] mt-1">Attaching ebook format</Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Original Price (৳)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
        <div><Label>Pages</Label><Input type="number" value={form.pages} onChange={e => setForm(f => ({ ...f, pages: e.target.value }))} /></div>
        <div className="col-span-2">
          <Label>Upload PDF/EPUB</Label>
          <input ref={fileRef} type="file" accept=".pdf,.epub" className="hidden" onChange={e => handleFileUpload(e, attachedBook?.id)} />
          <div className="flex items-center gap-3 mt-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadingFile}>
              {uploadingFile ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload eBook File</>}
            </Button>
            {form.file_url && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 text-xs">✓ File uploaded</Badge>}
          </div>
        </div>
      </div>
      {attachedBook && form.price && Number(form.price) > 0 && (
        <VendorEarningsPreview bookId={attachedBook.id} format="ebook" basePrice={Number(form.price)} role="writer" />
      )}
      <Button className="w-full" onClick={saveAttachFormat} disabled={uploading}>
        {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Attaching...</> : "Attach & Submit for Review"}
      </Button>
    </div>
  );

  const renderCreateForm = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Cover Image</Label>
          <div className="flex items-center gap-4 mt-1.5">
            {form.cover_url && <img src={form.cover_url} alt="" className="w-16 h-24 object-cover rounded border" />}
            <div>
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              <Button type="button" variant="outline" size="sm" onClick={() => coverRef.current?.click()} disabled={uploadingCover}>
                {uploadingCover ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload Cover</>}
              </Button>
            </div>
          </div>
        </div>
        <div className="col-span-2"><Label>Title (Bengali) *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
        <div><Label>Title (English)</Label><Input value={form.title_en} onChange={e => setForm(f => ({ ...f, title_en: e.target.value }))} /></div>
        <div>
          <Label>Category</Label>
          <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_bn || c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
        <div><Label>Original Price (৳)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
        <div><Label>Pages</Label><Input type="number" value={form.pages} onChange={e => setForm(f => ({ ...f, pages: e.target.value }))} /></div>
        <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></div>
        <div><Label>Language</Label><Input value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} /></div>
        <div className="col-span-2">
          <Label>Upload PDF/EPUB</Label>
          <input ref={fileRef} type="file" accept=".pdf,.epub" className="hidden" onChange={e => handleFileUpload(e, editBook?.id)} />
          <div className="flex items-center gap-3 mt-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadingFile}>
              {uploadingFile ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload eBook File</>}
            </Button>
            {form.file_url && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 text-xs">✓ File uploaded</Badge>}
          </div>
        </div>
      </div>
      {editBook && form.price && Number(form.price) > 0 && (
        <VendorEarningsPreview bookId={editBook.id} format="ebook" basePrice={Number(form.price)} role="writer" />
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold">My Books</h1>
        <Button onClick={openNew} className="gap-2" disabled={!canAddFormat("ebook")}><Plus className="h-4 w-4" />Submit eBook</Button>
      </div>

      {books.length > 0 ? (
        <div className="grid gap-4">
          {books.map(book => (
            <Card key={book.id} className="border-border/30 bg-card/60">
              <CardContent className="p-4 flex gap-4">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" className="w-16 h-24 object-cover rounded" />
                ) : (
                  <div className="w-16 h-24 bg-muted rounded flex items-center justify-center">
                    <Image className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{book.title}</h3>
                    {statusBadge(book.submission_status || "pending")}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{book.categories?.name_bn || book.categories?.name || "No category"}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{book.description || "No description"}</p>
                </div>
                <div className="shrink-0 flex flex-col gap-1.5">
                  {(book.book_formats || []).find((f: any) => f.format === "ebook") && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const fmt = (book.book_formats || []).find((f: any) => f.format === "ebook");
                      if (fmt) { setSelectedFormatId(fmt.id); setSelectedBookTitle(book.title); setChaptersOpen(true); }
                    }} className="gap-1 text-xs h-8">
                      <Layers className="h-3 w-3" />Chapters
                    </Button>
                  )}
                  {book.submission_status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(book)} className="gap-1 text-xs h-8">
                      <Pencil className="h-3 w-3" />Edit
                    </Button>
                  )}
                  {book.submission_status === "draft" && (
                    <Button size="sm" onClick={() => submitForReview(book)} className="gap-1 text-xs h-8 bg-primary">
                      <Upload className="h-3 w-3" />Submit
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
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No books submitted yet. Click "Submit eBook" to get started.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editBook ? "Edit Submission" : mode === "attach" ? "Attach to Existing Book" : mode === "attach-form" ? "Attach eBook Format" : mode === "create" ? "Create New Book" : "Submit eBook"}
            </DialogTitle>
          </DialogHeader>
          {mode === "choose" && !editBook && renderChooseMode()}
          {mode === "attach" && <AttachToExistingBook format="ebook" onSelect={handleAttachSelect} onCancel={() => setMode("choose")} />}
          {mode === "attach-form" && renderAttachForm()}
          {mode === "create" && renderCreateForm()}
        </DialogContent>
      </Dialog>

      {selectedFormatId && (
        <EbookChapterManager
          bookFormatId={selectedFormatId}
          bookTitle={selectedBookTitle}
          open={chaptersOpen}
          onOpenChange={setChaptersOpen}
        />
      )}
    </div>
  );
}
