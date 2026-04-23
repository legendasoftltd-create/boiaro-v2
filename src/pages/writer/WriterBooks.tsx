import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Loader2, Pencil, Image, Link2, Layers, Lock } from "lucide-react";
import { toast } from "sonner";
import { EbookChapterManager } from "@/components/writer/EbookChapterManager";
import { useCreatorPermissions } from "@/hooks/useCreatorPermissions";
import { AttachToExistingBook } from "@/components/book-submission/AttachToExistingBook";
import { VendorEarningsPreview } from "@/components/vendor/VendorEarningsPreview";
import { useContentEditRequest } from "@/hooks/useContentEditRequest";

const emptyForm = () => ({
  title: "", title_en: "", description: "", category_id: "", cover_url: "",
  language: "bn", tags: "", price: "", pages: "", chapters_count: "", file_url: "", file_size: "",
});

type BookWithFormats = {
  id: string; title: string; cover_url: string | null; submission_status: string;
  description: string | null; category: { name: string; name_bn: string | null } | null;
  formats: Array<{ id: string; format: string; price: number | null; chapters_count: number | null; file_url: string | null; file_size: string | null }>;
};

export default function WriterBooks() {
  const { canAddFormat } = useCreatorPermissions();
  const { submitEditRequest } = useContentEditRequest();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editBook, setEditBook] = useState<BookWithFormats | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [selectedBookTitle, setSelectedBookTitle] = useState("");
  const [mode, setMode] = useState<"choose" | "create" | "attach" | "attach-form">("choose");
  const [attachedBook, setAttachedBook] = useState<{ id: string; title: string; cover_url: string | null } | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: books = [], isLoading } = trpc.books.myCreatorBooks.useQuery({ role: "writer" });
  const { data: categories = [] } = trpc.books.categories.useQuery();

  const submitMutation = trpc.books.submitBook.useMutation({
    onSuccess: () => { utils.books.myCreatorBooks.invalidate(); setOpen(false); toast.success("Submitted for review"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.books.updateBook.useMutation({
    onSuccess: () => { utils.books.myCreatorBooks.invalidate(); setOpen(false); toast.success("Book updated"); },
    onError: (err) => toast.error(err.message),
  });
  const attachMutation = trpc.books.attachBookFormat.useMutation({
    onSuccess: () => { utils.books.myCreatorBooks.invalidate(); setOpen(false); toast.success("eBook format attached and submitted for review"); },
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
  const openEdit = (book: BookWithFormats) => {
    setEditBook(book); setAttachedBook(null); setMode("create");
    const fmt = book.formats.find(f => f.format === "ebook");
    setForm({ ...emptyForm(), title: book.title, description: book.description || "", price: fmt?.price?.toString() || "", file_url: fmt?.file_url || "", file_size: fmt?.file_size || "", chapters_count: fmt?.chapters_count?.toString() || "" });
    setOpen(true);
  };

  const save = async (asDraft = false) => {
    if (!form.title) { toast.error("Title is required"); return; }
    if (editBook) {
      if (editBook.submission_status !== "draft") {
        const fmt = editBook.formats.find(f => f.format === "ebook");
        await submitEditRequest({ contentType: "book", contentId: editBook.id, submittedBy: "", proposedChanges: { book: form, format: { price: Number(form.price), format_id: fmt?.id } } });
        setOpen(false); return;
      }
      updateMutation.mutate({
        bookId: editBook.id,
        formatId: editBook.formats.find(f => f.format === "ebook")?.id,
        title: form.title, titleEn: form.title_en || undefined, description: form.description || undefined,
        categoryId: form.category_id || undefined, coverUrl: form.cover_url || undefined,
        language: form.language, tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        asDraft, format: "ebook", price: form.price ? Number(form.price) : 0,
        pages: form.pages ? Number(form.pages) : undefined,
        chaptersCount: form.chapters_count ? Number(form.chapters_count) : undefined,
        fileUrl: form.file_url || undefined, fileSize: form.file_size || undefined,
      });
    } else {
      submitMutation.mutate({
        title: form.title, titleEn: form.title_en || undefined, description: form.description || undefined,
        categoryId: form.category_id || undefined, coverUrl: form.cover_url || undefined,
        language: form.language, tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        asDraft, format: "ebook", role: "writer", price: form.price ? Number(form.price) : 0,
        pages: form.pages ? Number(form.pages) : undefined,
        chaptersCount: form.chapters_count ? Number(form.chapters_count) : undefined,
        fileUrl: form.file_url || undefined, fileSize: form.file_size || undefined,
      });
    }
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
          <p className="text-xs text-muted-foreground">File upload available in Phase 5 (storage provider configuration pending)</p>
        </div>
      </div>
      {attachedBook && form.price && Number(form.price) > 0 && (
        <VendorEarningsPreview bookId={attachedBook.id} format="ebook" basePrice={Number(form.price)} role="writer" />
      )}
      <Button className="w-full" onClick={() => {
        if (!attachedBook) return;
        attachMutation.mutate({ bookId: attachedBook.id, format: "ebook", role: "writer", price: form.price ? Number(form.price) : 0, pages: form.pages ? Number(form.pages) : undefined });
      }} disabled={isPending}>
        {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Attaching...</> : "Attach & Submit for Review"}
      </Button>
    </div>
  );

  const renderCreateForm = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Cover Image</Label>
          <p className="text-xs text-muted-foreground mt-1">Cover upload available in Phase 5 (storage provider pending)</p>
        </div>
        <div className="col-span-2"><Label>Title (Bengali) *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
        <div><Label>Title (English)</Label><Input value={form.title_en} onChange={e => setForm(f => ({ ...f, title_en: e.target.value }))} /></div>
        <div>
          <Label>Category</Label>
          <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>{(categories as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name_bn || c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
        <div><Label>Original Price (৳)</Label><Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
        <div><Label>Pages</Label><Input type="number" value={form.pages} onChange={e => setForm(f => ({ ...f, pages: e.target.value }))} /></div>
        <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></div>
        <div><Label>Language</Label><Input value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} /></div>
      </div>
      {editBook && form.price && Number(form.price) > 0 && (
        <VendorEarningsPreview bookId={editBook.id} format="ebook" basePrice={Number(form.price)} role="writer" />
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold">My Books</h1>
        <Button onClick={openNew} className="gap-2" disabled={!canAddFormat("ebook")}><Plus className="h-4 w-4" />Submit eBook</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : books.length > 0 ? (
        <div className="grid gap-4">
          {(books as any[]).map((book: any) => (
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
                  <p className="text-xs text-muted-foreground mb-2">{book.category?.name_bn || book.category?.name || "No category"}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{book.description || "No description"}</p>
                </div>
                <div className="shrink-0 flex flex-col gap-1.5">
                  {(book.formats || []).find((f: any) => f.format === "ebook") && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const fmt = (book.formats || []).find((f: any) => f.format === "ebook");
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
                    <Button size="sm" onClick={() => submitForReviewMutation.mutate({ bookId: book.id })} disabled={submitForReviewMutation.isPending} className="gap-1 text-xs h-8 bg-primary">
                      Submit
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
          {mode === "attach" && <AttachToExistingBook format="ebook" onSelect={(b) => { setAttachedBook(b); setMode("attach-form"); }} onCancel={() => setMode("choose")} />}
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
