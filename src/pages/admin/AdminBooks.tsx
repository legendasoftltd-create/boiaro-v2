import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorySelector } from "@/components/admin/CategorySelector";
import { SearchableSelect } from "@/components/admin/SearchableSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Upload, BookOpen, Headphones, Package, Music, Loader2, Image, AlertTriangle, BookMarked, Coins, CheckCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { BookContributors } from "@/components/admin/BookContributors";
import { BookRevenueSplit } from "@/components/admin/BookRevenueSplit";
import { HardcopyProfitCalculator } from "@/components/admin/HardcopyProfitCalculator";
import { SmartPricingAssistant } from "@/components/admin/SmartPricingAssistant";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { validateMediaFile, sanitizeTrackTitle, ACCEPTED_FILE_INPUT } from "@/lib/audioValidation";
import { useAdminLogger } from "@/hooks/useAdminLogger";

export default function AdminBooks() {
  const [books, setBooks] = useState<any[]>([]);
  const [bookFormats, setBookFormats] = useState<Record<string, any[]>>({});
  const [bookContribCounts, setBookContribCounts] = useState<Record<string, number>>({});
  const [authors, setAuthors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [publishers, setPublishers] = useState<any[]>([]);
  const [narrators, setNarrators] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFeatured, setFilterFeatured] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterStock, setFilterStock] = useState("all");
  const [open, setOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [editBook, setEditBook] = useState<any>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [formatsByBookId, setFormatsByBookId] = useState<Record<string, any[]>>({});
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [formatsHydratedBookId, setFormatsHydratedBookId] = useState<string | null>(null);
  const formatFetchRef = useRef(0);
  const [tracks, setTracks] = useState<any[]>([]);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackTitle, setEditingTrackTitle] = useState("");
  const [editingTrackPrice, setEditingTrackPrice] = useState("");
  const [fullAudiobookPrice, setFullAudiobookPrice] = useState<number | null>(null);
  const [formatForm, setFormatForm] = useState<any>({ format: "ebook" });
  const [recordPurchaseInLedger, setRecordPurchaseInLedger] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingTrack, setUploadingTrack] = useState(false);
  const [addingTrack, setAddingTrack] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [trackForm, setTrackForm] = useState({ title: "", audio_url: "", duration: "", chapter_price: "" });
  const [uploadedMediaType, setUploadedMediaType] = useState<"audio" | "video">("audio");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const singleTrackInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: "", title_en: "", slug: "", description: "", description_bn: "",
    author_id: "", category_id: "", publisher_id: "", narrator_id: "", cover_url: "",
    is_featured: false, is_bestseller: false, is_new: false, is_free: false,
    language: "bn", tags: "",
  });

  const formats = selectedBookId ? (formatsByBookId[selectedBookId] || []) : [];
  const formatsLoaded = !!selectedBookId && formatsHydratedBookId === selectedBookId;
  const { log } = useAdminLogger();

  useEffect(() => {
    if (!formatOpen || !selectedBookId) return;
    console.debug("[AdminBooks][Formats] render state", {
      selectedBookId,
      loading: formatsLoading,
      loaded: formatsLoaded,
      savedFormatsCount: formats.length,
      savedFormatTypes: formats.map((f) => f.format),
      editingFormatId: formatForm?.id ?? null,
      editingFormatType: formatForm?.format ?? null,
    });
  }, [formatOpen, selectedBookId, formatsLoading, formatsLoaded, formats, formatForm?.id, formatForm?.format]);

  const load = async () => {
    const [b, a, c, p, n, bf, bc] = await Promise.all([
      supabase.from("books").select("*, authors(name), categories(name, name_bn), publishers(name)").order("created_at", { ascending: false }),
      supabase.from("authors").select("id, name"),
      supabase.from("categories").select("id, name, name_bn"),
      supabase.from("publishers").select("id, name"),
      supabase.from("narrators").select("id, name"),
      supabase.from("book_formats").select("book_id, format, narrator_id, narrators(name)"),
      supabase.from("book_contributors").select("book_id"),
    ]);
    setBooks(b.data || []);
    setAuthors(a.data || []);
    setCategories(c.data || []);
    setPublishers(p.data || []);
    setNarrators(n.data || []);

    // Group formats by book_id for badges
    const fmtMap: Record<string, any[]> = {};
    (bf.data || []).forEach((f) => {
      if (!fmtMap[f.book_id]) fmtMap[f.book_id] = [];
      fmtMap[f.book_id].push(f);
    });
    setBookFormats(fmtMap);

    // Count contributors per book
    const contribMap: Record<string, number> = {};
    (bc.data || []).forEach((c) => {
      contribMap[c.book_id] = (contribMap[c.book_id] || 0) + 1;
    });
    setBookContribCounts(contribMap);
  };

  useEffect(() => { load(); }, []);

  // Cover image upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const ext = file.name.split(".").pop();
    const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("book-covers").upload(path, file);
    if (error) { toast.error("Upload failed: " + error.message); setUploadingCover(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("book-covers").getPublicUrl(path);
    setForm({ ...form, cover_url: publicUrl });
    setUploadingCover(false);
    toast.success("Cover uploaded");
  };

  // Ebook file upload
  const handleEbookUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedBookId) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${selectedBookId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("ebooks").upload(path, file);
    if (error) { toast.error("Upload failed: " + error.message); setUploading(false); return; }
    // Store the path (not public URL since ebooks bucket is private)
    setFormatForm({ ...formatForm, file_url: path, file_size: `${(file.size / 1024 / 1024).toFixed(1)} MB` });
    setUploading(false);
    toast.success("eBook file uploaded");
  };

  // Single track file upload (narrator-style)
  const handleSingleTrackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFormatId) return;

    const validation = await validateMediaFile(file);
    if (validation.valid === false) {
      toast.error(validation.error);
      return;
    }

    setUploadingTrack(true);
    const { file: validatedFile, durationLabel, mediaType, mimeType } = validation.data;
    const name = sanitizeTrackTitle(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
    const path = `${selectedFormatId}/${Date.now()}-${tracks.length + 1}.${ext}`;

    const { error } = await supabase.storage.from("audiobooks").upload(path, validatedFile, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      toast.error(error.message);
      setUploadingTrack(false);
      return;
    }

    setUploadedMediaType(mediaType);
    setTrackForm(f => ({
      ...f,
      audio_url: path,
      duration: durationLabel,
      title: f.title || name,
    }));
    setUploadingTrack(false);
    toast.success(`${mediaType === "video" ? "Video" : "Audio"} file uploaded`);
  };

  // Save single track (narrator-style)
  const saveNewTrack = async () => {
    if (!trackForm.title.trim()) {
      toast.error("Chapter title is required");
      return;
    }
    if (!trackForm.audio_url) {
      toast.error("Please upload a media file");
      return;
    }
    if (!selectedFormatId) return;
    setSavingTrack(true);
    const nextOrder = tracks.length + 1;
    const chapterPrice = trackForm.chapter_price ? Number(trackForm.chapter_price) : null;

    const { error } = await supabase.from("audiobook_tracks").insert({
      book_format_id: selectedFormatId,
      title: trackForm.title.trim(),
      audio_url: trackForm.audio_url,
      track_number: nextOrder,
      duration: trackForm.duration || null,
      is_preview: nextOrder === 1,
      status: "draft",
      media_type: uploadedMediaType,
      chapter_price: chapterPrice,
    } as any);

    if (error) {
      toast.error(error.message);
      setSavingTrack(false);
      return;
    }

    setSavingTrack(false);
    setAddingTrack(false);
    setTrackForm({ title: "", audio_url: "", duration: "", chapter_price: "" });
    toast.success(`Chapter ${nextOrder} added`);
    loadTracks(selectedFormatId);
  };

  const loadTracks = async (formatId: string) => {
    const { data } = await supabase.from("audiobook_tracks").select("*").eq("book_format_id", formatId).order("track_number");
    setTracks(data || []);
  };

  const deleteTrack = async (id: string) => {
    await supabase.from("audiobook_tracks").delete().eq("id", id);
    if (selectedFormatId) loadTracks(selectedFormatId);
    toast.success("Track deleted");
  };

  const renameTrack = async (id: string) => {
    const trimmed = editingTrackTitle.trim();
    if (!trimmed) { toast.error("Title cannot be empty"); return; }
    const price = editingTrackPrice ? Number(editingTrackPrice) : null;
    const { error } = await supabase.from("audiobook_tracks").update({ title: trimmed, chapter_price: price } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTracks(tracks.map(t => t.id === id ? { ...t, title: trimmed, chapter_price: price } : t));
    setEditingTrackId(null);
    toast.success("Track updated");
  };

  const DEFAULT_CHAPTER_PRICE = 100;

  const openTracks = async (formatId: string) => {
    setSelectedFormatId(formatId);
    setTracksOpen(true);
    loadTracks(formatId);
    // Load full audiobook price
    const { data } = await supabase.from("book_formats").select("price").eq("id", formatId).maybeSingle();
    setFullAudiobookPrice(data ? Number(data.price) || 0 : null);
  };

  const totalChapterCoinPrice = tracks.reduce((sum: number, t: any) => {
    if (t.is_preview) return sum;
    return sum + (t.chapter_price ?? DEFAULT_CHAPTER_PRICE);
  }, 0);
  const totalChapterBDT = totalChapterCoinPrice * 0.05;
  const priceWarning = fullAudiobookPrice !== null && fullAudiobookPrice > 0 && totalChapterBDT < fullAudiobookPrice;

  const openNew = () => {
    setEditBook(null);
    setForm({
      title: "", title_en: "", slug: "", description: "", description_bn: "",
      author_id: "", category_id: "", publisher_id: "", narrator_id: "", cover_url: "",
      is_featured: false, is_bestseller: false, is_new: false, is_free: false,
      language: "bn", tags: "",
    });
    setOpen(true);
  };

  const openEdit = (book: any) => {
    setEditBook(book);
    setForm({
      title: book.title || "", title_en: book.title_en || "", slug: book.slug || "",
      description: book.description || "", description_bn: book.description_bn || "",
      author_id: book.author_id || "", category_id: book.category_id || "",
      publisher_id: book.publisher_id || "", narrator_id: "",
      cover_url: book.cover_url || "",
      is_featured: book.is_featured || false, is_bestseller: book.is_bestseller || false,
      is_new: book.is_new || false, is_free: book.is_free || false,
      language: book.language || "bn", tags: (book.tags || []).join(", "),
    });
    setOpen(true);
  };

  const save = async () => {
    const { narrator_id: _narratorId, ...formWithoutNarrator } = form;
    const payload: any = {
      ...formWithoutNarrator,
      author_id: form.author_id || null,
      category_id: form.category_id || null,
      publisher_id: form.publisher_id || null,
      tags: form.tags ? form.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : null,
    };
    if (!payload.slug) {
      payload.slug = payload.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u0980-\u09FF-]/g, "");
    }

    if (editBook) {
      const { error } = await supabase.from("books").update(payload).eq("id", editBook.id);
      if (error) { toast.error(error.message); return; }
      await log({ module: "books", action: "Book updated", actionType: "update", targetType: "book", targetId: editBook.id, details: `Updated book: ${payload.title}` });
      toast.success("Book updated");
    } else {
      const { data: inserted, error } = await supabase.from("books").insert(payload).select("id").maybeSingle();
      if (error) { toast.error(error.message); return; }
      await log({ module: "books", action: "Book created", actionType: "create", targetType: "book", targetId: inserted?.id, details: `Created book: ${payload.title}` });
      toast.success("Book created");
    }
    setOpen(false);
    load();
  };

  const deleteBook = async (id: string) => {
    if (!confirm("Delete this book and all its formats?")) return;
    await supabase.from("book_formats").delete().eq("book_id", id);
    await supabase.from("books").delete().eq("id", id);
    await log({ module: "books", action: "Book deleted", actionType: "delete", targetType: "book", targetId: id, details: `Deleted book: ${id}`, riskLevel: "high" });
    toast.success("Deleted");
    load();
  };

  const openFormats = async (bookId: string) => {
    setSelectedBookId(bookId);
    setFormatOpen(true);
    setFormatsLoading(true);
    setFormatsHydratedBookId(null);

    const requestId = ++formatFetchRef.current;
    console.debug("[AdminBooks][Formats] open request", { requestId, selectedBookId: bookId });

    const { data, error } = await supabase
      .from("book_formats")
      .select("id, book_id, format, price, original_price, discount, pages, duration, file_size, file_url, chapters_count, preview_chapters, preview_percentage, audio_quality, binding, dimensions, weight, weight_kg_per_copy, delivery_days, in_stock, stock_count, is_available, narrator_id, submission_status, printing_cost, unit_cost, default_packaging_cost, publisher_commission_percent, submitted_by, publisher_id, payout_model, isbn, created_at, updated_at, publishers:publisher_id(name)")
      .eq("book_id", bookId);

    if (requestId !== formatFetchRef.current) {
      console.debug("[AdminBooks][Formats] stale response ignored", { requestId, selectedBookId: bookId });
      return;
    }

    if (error) {
      console.error("[AdminBooks][Formats] fetch error", { selectedBookId: bookId, error });
      toast.error("Failed to load formats: " + error.message);
      setFormatsByBookId((prev) => ({ ...prev, [bookId]: [] }));
      setFormatForm({ format: "ebook" });
      setFormatsHydratedBookId(bookId);
      setFormatsLoading(false);
      return;
    }

    const fmts = data || [];
    console.debug("[AdminBooks][Formats] fetch success", {
      selectedBookId: bookId,
      count: fmts.length,
      formatTypes: fmts.map((f) => f.format),
    });

    setFormatsByBookId((prev) => ({ ...prev, [bookId]: fmts }));
    setFormatsHydratedBookId(bookId);
    setFormatForm((current: any) => {
      if (current?.id) {
        const sameRecord = fmts.find((f) => f.id === current.id);
        if (sameRecord) return sameRecord;
      }
      if (current?.format) {
        const sameType = fmts.find((f) => f.format === current.format);
        if (sameType) return sameType;
      }
      return fmts[0] || { format: "ebook" };
    });
    setFormatsLoading(false);
  };

  const validateIsbn = (isbn: string): boolean => {
    if (!isbn) return true; // optional
    const cleaned = isbn.replace(/[-\s]/g, "");
    if (cleaned.length === 10) {
      // ISBN-10: first 9 digits, last is digit or X
      if (!/^\d{9}[\dXx]$/.test(cleaned)) return false;
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(cleaned[i]);
      sum += cleaned[9].toUpperCase() === "X" ? 10 : parseInt(cleaned[9]);
      return sum % 11 === 0;
    }
    if (cleaned.length === 13) {
      if (!/^\d{13}$/.test(cleaned)) return false;
      let sum = 0;
      for (let i = 0; i < 13; i++) sum += (i % 2 === 0 ? 1 : 3) * parseInt(cleaned[i]);
      return sum % 10 === 0;
    }
    return false;
  };

  const saveFormat = async () => {
    if (!selectedBookId) return;
    // Validate ISBN if provided
    const isbnVal = (formatForm.isbn || "").trim();
    if (isbnVal && !validateIsbn(isbnVal)) {
      toast.error("Invalid ISBN. Must be a valid ISBN-10 or ISBN-13.");
      return;
    }
    const origPrice = formatForm.original_price ? Number(formatForm.original_price) : 0;
    const discPct = formatForm.discount ? Number(formatForm.discount) : 0;
    const finalPrice = origPrice > 0 ? origPrice - (origPrice * discPct / 100) : 0;
    const payload: any = {
      ...formatForm,
      book_id: selectedBookId,
      narrator_id: formatForm.narrator_id || null,
      price: Math.round(finalPrice * 100) / 100,
      original_price: origPrice || null,
      discount: discPct || null,
      pages: formatForm.pages ? Number(formatForm.pages) : null,
      stock_count: formatForm.stock_count ? Number(formatForm.stock_count) : null,
      chapters_count: formatForm.chapters_count ? Number(formatForm.chapters_count) : null,
      delivery_days: formatForm.delivery_days ? Number(formatForm.delivery_days) : null,
      preview_percentage: formatForm.preview_percentage !== "" && formatForm.preview_percentage != null ? Math.min(100, Math.max(0, Number(formatForm.preview_percentage))) : null,
      publisher_commission_percent: Math.min(100, Math.max(0, Number(formatForm.publisher_commission_percent) || 0)),
      weight_kg_per_copy: formatForm.weight_kg_per_copy ? Number(formatForm.weight_kg_per_copy) : 0.25,
      unit_cost: formatForm.unit_cost ? Number(formatForm.unit_cost) : null,
      default_packaging_cost: formatForm.default_packaging_cost ? Number(formatForm.default_packaging_cost) : 0,
      isbn: isbnVal || null,
    };
    // Remove relational/UI-only fields
    delete payload.narrators;
    delete payload.publishers;
    delete payload.unit_cost_manual;

    // Auto-set payout_model based on format
    if (!payload.payout_model) {
      payload.payout_model = payload.format === 'hardcopy' ? 'inventory_resale' : 'revenue_share';
    }
    payload.publisher_id = payload.publisher_id || null;

    if (formatForm.id) {
      const { error } = await supabase.from("book_formats").update(payload).eq("id", formatForm.id);
      if (error) { toast.error(error.message); return; }
    } else {
      // Check for duplicate format
      const existing = formats.find(f => f.format === payload.format);
      if (existing) { toast.error(`This book already has a ${payload.format} format. Edit the existing one instead.`); return; }
      const { error } = await supabase.from("book_formats").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    // Record inventory purchase in accounting ledger if toggled on
    if (recordPurchaseInLedger && payload.format === "hardcopy") {
      const qty = Number(purchaseQty) || 0;
      const unitCost = Number(formatForm.unit_cost) || 0;
      if (qty > 0 && unitCost > 0) {
        const bookTitle = books.find(b => b.id === selectedBookId)?.title || "Unknown";
        const currentStock = Number(formats.find(f => f.format === "hardcopy")?.stock_count) || 0;
        await supabase.from("accounting_ledger" as any).insert({
          type: "expense",
          category: "inventory_purchase",
          description: `Hardcopy stock purchase: ${bookTitle} — ${qty} copies × ৳${unitCost} (stock ${currentStock} → ${Number(payload.stock_count) || 0})`,
          amount: qty * unitCost,
          entry_date: new Date().toISOString().split("T")[0],
          book_id: selectedBookId,
          reference_type: "book_format",
          reference_id: formatForm.id || null,
        } as any);
        toast.success(`Ledger: ৳${(qty * unitCost).toLocaleString()} inventory expense recorded`);
      } else {
        toast.warning("Ledger entry skipped — purchase qty or unit cost is 0");
      }
      setRecordPurchaseInLedger(false);
      setPurchaseQty("");
    }
    toast.success("Format saved");
    openFormats(selectedBookId);
  };

  const deleteFormat = async (id: string) => {
    await supabase.from("audiobook_tracks").delete().eq("book_format_id", id);
    await supabase.from("book_formats").delete().eq("id", id);
    toast.success("Deleted");
    if (selectedBookId) openFormats(selectedBookId);
  };

  // openTracks is defined above with pricing summary support

  const formatBadge = (fmt: string, bookId: string) => {
    const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
      ebook: { label: "eBook", icon: <BookOpen className="w-3 h-3" />, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
      audiobook: { label: "Audio", icon: <Headphones className="w-3 h-3" />, className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
      hardcopy: { label: "Hard Copy", icon: <Package className="w-3 h-3" />, className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    };
    const c = config[fmt] || { label: fmt, icon: null, className: "" };
    return (
      <Badge
        key={fmt}
        variant="outline"
        className={`text-[11px] px-2 py-0.5 gap-1 font-medium cursor-pointer hover:opacity-80 transition-opacity ${c.className}`}
        onClick={() => openFormats(bookId)}
      >
        {c.icon}{c.label}
      </Badge>
    );
  };

  const filteredBooks = books.filter((b) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = (b.title || "").toLowerCase();
      const titleEn = (b.title_en || "").toLowerCase();
      const author = (b.authors?.name || "").toLowerCase();
      const publisher = (b.publishers?.name || "").toLowerCase();
      const narrator = ((bookFormats[b.id] || []).find((f: any) => f.format === "audiobook")?.narrators?.name || "").toLowerCase();
      if (!title.includes(q) && !titleEn.includes(q) && !author.includes(q) && !publisher.includes(q) && !narrator.includes(q)) return false;
    }
    if (filterCategory !== "all" && b.category_id !== filterCategory) return false;
    if (filterFeatured === "yes" && !b.is_featured) return false;
    if (filterFeatured === "no" && b.is_featured) return false;
    if (filterFormat !== "all") {
      const fmts = bookFormats[b.id] || [];
      if (!fmts.some((f: any) => f.format === filterFormat)) return false;
    }
    if (filterStock !== "all") {
      const hcFmt = (bookFormats[b.id] || []).find((f: any) => f.format === "hardcopy");
      if (!hcFmt) return false;
      if (filterStock === "out" && (hcFmt.stock_count || 0) > 0) return false;
      if (filterStock === "low" && ((hcFmt.stock_count || 0) <= 0 || (hcFmt.stock_count || 0) > 5)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-black">Books</h1>
        <Button className="" onClick={openNew}><Plus className="h-4 w-4 mr-2 text-white" />Add Book</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <AdminSearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search by title, author, narrator..." className="flex-1 min-w-[200px] max-w-sm" />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_bn || c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterFeatured} onValueChange={setFilterFeatured}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Featured" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="yes">Featured</SelectItem>
            <SelectItem value="no">Not Featured</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterFormat} onValueChange={setFilterFormat}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Format" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="ebook">eBook</SelectItem>
            <SelectItem value="audiobook">Audiobook</SelectItem>
            <SelectItem value="hardcopy">Hard Copy</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStock} onValueChange={setFilterStock}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Stock" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="low">⚠ Low Stock (≤5)</SelectItem>
            <SelectItem value="out">🔴 Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className=" shadow-lg border">
        <Table>
          <TableHeader >
            <>
              <TableHead className="text-white">Cover</TableHead>
              <TableHead className="text-white">Title</TableHead>
              <TableHead className="text-white">Author</TableHead>
              <TableHead className="text-white">Narrator</TableHead>
              <TableHead className="text-white">Category</TableHead>
              <TableHead className="text-white">Publisher</TableHead>
              <TableHead className="text-white">Formats</TableHead>
              <TableHead className="text-white">Featured</TableHead>
              <TableHead className="text-right text-white">Actions</TableHead>
            </>
          </TableHeader>
          <TableBody>
            {filteredBooks.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  {b.cover_url ? (
                    <img src={b.cover_url} alt="" className="w-10 h-14 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                      <Image className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">{b.title}</TableCell>
                <TableCell>{b.authors?.name || "—"}</TableCell>
                <TableCell className="text-sm">
                  {(() => {
                    const audioFmt = (bookFormats[b.id] || []).find((f: any) => f.format === "audiobook" && f.narrators?.name);
                    return audioFmt ? audioFmt.narrators.name : "—";
                  })()}
                </TableCell>
                <TableCell className="text-sm">{b.categories?.name_bn || b.categories?.name || "—"}</TableCell>
                <TableCell className="text-sm">{b.publishers?.name || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap items-center">
                    {(bookFormats[b.id] || []).map((f) => formatBadge(f.format, b.id))}
                    {!(bookFormats[b.id]?.length) && <span className="text-muted-foreground text-xs">None</span>}
                    {!bookContribCounts[b.id] && (
                      <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30 gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> No Contributors
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{b.is_featured ? "✓" : "—"}</TableCell>
                <TableCell className="text-right space-x-1 gap-2 flex gap-2 justify-between">
                  <Button size="sm" variant="outline" onClick={() => openFormats(b.id)}>Formats</Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteBook(b.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!books.length && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No books yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Book dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBook ? "Edit Book" : "Add Book"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* Cover upload */}
            <div className="col-span-2">
              <Label>Cover Image</Label>
              <div className="flex items-center gap-4 mt-1.5">
                {form.cover_url && (
                  <img src={form.cover_url} alt="Cover" className="w-16 h-24 object-cover rounded border" />
                )}
                <div className="flex-1">
                  <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                  <Button type="button" variant="outline" size="sm" onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}>
                    {uploadingCover ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload Cover</>}
                  </Button>
                  <Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="Or paste URL" className="mt-2" />
                </div>
              </div>
            </div>
            <div className="col-span-2">
              <Label>Title (Bengali)</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Title (English)</Label>
              <Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" />
            </div>
            <div>
              <Label>Author</Label>
              <SearchableSelect
                options={authors.map((a) => ({ id: a.id, label: a.name }))}
                value={form.author_id}
                onChange={(v) => setForm({ ...form, author_id: v })}
                placeholder="Select author"
                searchPlaceholder="Search authors..."
                emptyText="No authors found"
              />
            </div>
            <div>
              <Label>Category</Label>
              <CategorySelector
                categories={categories}
                value={form.category_id}
                onChange={(v) => setForm({ ...form, category_id: v })}
              />
            </div>
            <div>
              <Label>Publisher <span className="text-muted-foreground text-xs">(legacy / default)</span></Label>
              <SearchableSelect
                options={publishers.map((p) => ({ id: p.id, label: p.name }))}
                value={form.publisher_id}
                onChange={(v) => setForm({ ...form, publisher_id: v })}
                placeholder="Select publisher (optional)"
                searchPlaceholder="Search publishers..."
                emptyText="No publishers found"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Each format can have its own publisher. Set per-format publisher in the Formats dialog.</p>
            </div>
            <div>
              <Label>Narrator <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <SearchableSelect
                options={narrators.map((n) => ({ id: n.id, label: n.name }))}
                value={form.narrator_id}
                onChange={(v) => setForm({ ...form, narrator_id: v })}
                placeholder="Select narrator"
                searchPlaceholder="Search narrators..."
                emptyText="No narrators found"
              />
            </div>
            <div>
              <Label>Language</Label>
              <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>Tags (comma separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-4 flex-wrap">
              {(["is_featured", "is_bestseller", "is_new", "is_free"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                  {key.replace("is_", "").replace("_", " ")}
                </label>
              ))}
            </div>
          </div>
          <Button className="mt-4 w-full" onClick={save}>Save Book</Button>
        </DialogContent>
      </Dialog>

      {/* Formats dialog */}
      <Dialog open={formatOpen} onOpenChange={setFormatOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Book Formats, Contributors & Revenue</DialogTitle>
          </DialogHeader>

          {/* Contributors */}
          {selectedBookId && <BookContributors bookId={selectedBookId} />}

          {/* Revenue Split */}
          {selectedBookId && <BookRevenueSplit bookId={selectedBookId} />}

          {/* Existing Formats Summary */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Saved Formats
                {formatsLoading && <span className="text-xs font-normal text-muted-foreground">(loading...)</span>}
                {!formatsLoading && formatsLoaded && formats.length === 0 && <span className="text-xs font-normal text-muted-foreground">(none yet)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {formatsLoading ? (
                <p className="text-xs text-muted-foreground py-2">Loading saved formats...</p>
              ) : !formatsLoaded ? (
                <p className="text-xs text-muted-foreground py-2">Loading format data for this book...</p>
              ) : formats.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No formats added yet. Use the editor below to add one.</p>
              ) : (
                <div className="grid gap-2">
                  {formats.map((f) => {
                    const isEditing = formatForm.id === f.id;
                    const fmtConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
                      ebook: { icon: <BookOpen className="h-3.5 w-3.5" />, label: "eBook", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                      audiobook: { icon: <Headphones className="h-3.5 w-3.5" />, label: "Audiobook", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
                      hardcopy: { icon: <Package className="h-3.5 w-3.5" />, label: "Hard Copy", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
                    };
                    const cfg = fmtConfig[f.format] || fmtConfig.ebook;
                    return (
                      <div
                        key={f.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isEditing ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/50 bg-muted/30 hover:bg-muted/50"}`}
                      >
                        <Badge variant="outline" className={`gap-1 text-xs font-medium ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </Badge>
                        <span className="text-sm font-medium">৳{f.price || 0}</span>
                        <button
                          onClick={async () => {
                            const newVal = !(f.is_available ?? true);
                            const { error } = await supabase.from("book_formats").update({ is_available: newVal }).eq("id", f.id);
                            if (error) { toast.error(error.message); return; }
                            if (selectedBookId) {
                              setFormatsByBookId((prev) => ({
                                ...prev,
                                [selectedBookId]: (prev[selectedBookId] || []).map((fmt) =>
                                  fmt.id === f.id ? { ...fmt, is_available: newVal } : fmt,
                                ),
                              }));
                            }
                            toast.success(`Format ${newVal ? "activated" : "deactivated"}`);
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition-colors ${(f.is_available ?? true) ? "bg-green-500/10 text-green-400 hover:bg-green-500/20" : "bg-red-500/10 text-red-400 hover:bg-red-500/20"}`}
                        >
                          {(f.is_available ?? true) ? "Active" : "Inactive"}
                        </button>
                        {f.format === "ebook" && f.file_url && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400">File ✓</Badge>}
                        {f.format === "audiobook" && (
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openTracks(f.id)}>
                            <Music className="h-3 w-3 mr-1" />Tracks
                          </Button>
                        )}
                        {f.format === "hardcopy" && f.stock_count != null && (
                          f.stock_count <= 0
                            ? <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30 animate-pulse">Out of Stock</Badge>
                            : f.stock_count <= 5
                              ? <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">Low: {f.stock_count}</Badge>
                              : <span className="text-[10px] text-muted-foreground">Stock: {f.stock_count}</span>
                        )}
                        {f.publishers?.name && <span className="text-[10px] text-muted-foreground">📦 {f.publishers.name}</span>}
                        <div className="ml-auto flex items-center gap-1">
                          {isEditing ? (
                            <Badge className="text-[10px] bg-primary text-primary-foreground">Editing</Badge>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setFormatForm(f)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteFormat(f.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-3 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {formatForm.id ? (
                  <><Pencil className="h-4 w-4 text-primary" />Editing: {formatForm.format === "ebook" ? "eBook" : formatForm.format === "audiobook" ? "Audiobook" : "Hard Copy"}</>
                ) : (
                  <><Plus className="h-4 w-4 text-primary" />Add New Format</>
                )}
                {formatForm.id && (
                  <Button size="sm" variant="ghost" className="ml-auto text-xs h-7" onClick={() => {
                    const missingFormats = ["ebook", "audiobook", "hardcopy"].filter(ft => !formats.find(f => f.format === ft));
                    setFormatForm({ format: missingFormats[0] || "ebook" });
                  }}>
                    <Plus className="h-3 w-3 mr-1" />Add New Instead
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={formatForm.format} onValueChange={(v) => {
                // When switching tabs, auto-load existing format data if available
                const existing = formats.find(f => f.format === v);
                if (existing) {
                  setFormatForm(existing);
                } else {
                  setFormatForm({ format: v, payout_model: v === 'hardcopy' ? 'inventory_resale' : 'revenue_share' });
                }
              }}>
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="ebook" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />eBook</TabsTrigger>
                  <TabsTrigger value="audiobook" className="gap-1.5"><Headphones className="h-3.5 w-3.5" />Audiobook</TabsTrigger>
                  <TabsTrigger value="hardcopy" className="gap-1.5"><Package className="h-3.5 w-3.5" />Hard Copy</TabsTrigger>
                </TabsList>

                <div className="grid grid-cols-2 gap-3">
                  {/* Active toggle */}
                  <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <Label htmlFor="format-active" className="text-sm font-medium flex-1">Format Active</Label>
                    <button
                      id="format-active"
                      type="button"
                      onClick={() => setFormatForm({ ...formatForm, is_available: !(formatForm.is_available ?? true) })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${(formatForm.is_available ?? true) ? "bg-green-500" : "bg-muted-foreground/30"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${(formatForm.is_available ?? true) ? "translate-x-5" : ""}`} />
                    </button>
                    <span className={`text-xs font-medium ${(formatForm.is_available ?? true) ? "text-green-500" : "text-red-400"}`}>
                      {(formatForm.is_available ?? true) ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {/* Format-level Publisher */}
                  <div className="col-span-2">
                    <Label>{formatForm.format === 'hardcopy' ? 'Source / Supplier Publisher' : 'Format Publisher'}</Label>
                    <SearchableSelect
                      options={publishers.map((p) => ({ id: p.id, label: p.name }))}
                      value={formatForm.publisher_id || ""}
                      onChange={(v) => setFormatForm({ ...formatForm, publisher_id: v })}
                      placeholder={formatForm.format === 'hardcopy' ? 'Select supplier/source' : 'Select publisher for this format'}
                      searchPlaceholder="Search publishers..."
                      emptyText="No publishers found"
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={`text-[9px] ${formatForm.payout_model === 'inventory_resale' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                        {formatForm.payout_model === 'inventory_resale' ? 'Inventory Resale Model' : 'Revenue Share Model'}
                      </Badge>
                      {formatForm.format === 'hardcopy' && (
                        <p className="text-[10px] text-muted-foreground">Hardcopy uses cost-based profit, not automatic publisher earnings</p>
                      )}
                    </div>
                  </div>
                  {/* Common fields */}
                  <div>
                    <Label>Original Price (৳)</Label>
                    <Input type="number" value={formatForm.original_price || ""} onChange={(e) => setFormatForm({ ...formatForm, original_price: e.target.value })} placeholder="Base price before discount" />
                  </div>
                  <div>
                    <Label>Discount %</Label>
                    <Input type="number" min={0} max={100} value={formatForm.discount || ""} onChange={(e) => setFormatForm({ ...formatForm, discount: e.target.value })} placeholder="Admin discount" />
                  </div>
                  <div className="col-span-2">
                    <Label>Final Selling Price (৳)</Label>
                    <Input
                      type="number"
                      readOnly
                      disabled
                      value={(() => {
                        const orig = Number(formatForm.original_price) || 0;
                        const disc = Number(formatForm.discount) || 0;
                        return orig > 0 ? (orig - orig * disc / 100).toFixed(0) : "";
                      })()}
                      className="bg-muted"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Auto-calculated: Original Price − (Original Price × Discount%)</p>
                  </div>

                  <TabsContent value="ebook" className="col-span-2 mt-0 grid grid-cols-2 gap-3">
                    <div>
                      <Label>Pages</Label>
                      <Input type="number" value={formatForm.pages || ""} onChange={(e) => setFormatForm({ ...formatForm, pages: e.target.value })} />
                    </div>
                    <div>
                      <Label>File Size</Label>
                      <Input value={formatForm.file_size || ""} onChange={(e) => setFormatForm({ ...formatForm, file_size: e.target.value })} placeholder="e.g. 2.5 MB" />
                    </div>
                    <div>
                      <Label>Chapters</Label>
                      <Input type="number" value={formatForm.chapters_count || ""} onChange={(e) => setFormatForm({ ...formatForm, chapters_count: e.target.value })} />
                    </div>
                    <div>
                      <Label>Preview Chapters</Label>
                      <Input type="number" value={formatForm.preview_chapters || ""} onChange={(e) => setFormatForm({ ...formatForm, preview_chapters: e.target.value })} />
                    </div>
                    <div>
                      <Label>Free Preview %</Label>
                      <Input type="number" min={0} max={100} value={formatForm.preview_percentage ?? ""} onChange={(e) => setFormatForm({ ...formatForm, preview_percentage: e.target.value })} placeholder="Default: 15%" />
                      <p className="text-[10px] text-muted-foreground mt-1">How much of the book is free before paywall (0-100)</p>
                    </div>
                    <div>
                      <Label>ISBN (Optional)</Label>
                      <Input value={formatForm.isbn || ""} onChange={(e) => setFormatForm({ ...formatForm, isbn: e.target.value })} placeholder="e.g. 978-3-16-148410-0" />
                      <p className="text-[10px] text-muted-foreground mt-1">Leave blank if not available</p>
                    </div>
                    <div className="col-span-2">
                      <Label>Upload PDF/EPUB</Label>
                      <input ref={fileInputRef} type="file" accept=".pdf,.epub" className="hidden" onChange={handleEbookUpload} />
                      <div className="flex items-center gap-3 mt-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                          {uploading ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload eBook File</>}
                        </Button>
                        {formatForm.file_url && <Badge variant="outline" className="bg-green-500/10 text-green-400 text-xs">✓ File uploaded</Badge>}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="audiobook" className="col-span-2 mt-0 grid grid-cols-2 gap-3">
                    <div>
                      <Label>Narrator</Label>
                      <Select value={formatForm.narrator_id || ""} onValueChange={(v) => setFormatForm({ ...formatForm, narrator_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select narrator" /></SelectTrigger>
                        <SelectContent>{narrators.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Total Duration</Label>
                      <Input value={formatForm.duration || ""} onChange={(e) => setFormatForm({ ...formatForm, duration: e.target.value })} placeholder="e.g. 3h 45m" />
                    </div>
                    <div>
                      <Label>Audio Quality</Label>
                      <Select value={formatForm.audio_quality || "standard"} onValueChange={(v) => setFormatForm({ ...formatForm, audio_quality: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="hd">HD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Chapters Count</Label>
                      <Input type="number" value={formatForm.chapters_count || ""} onChange={(e) => setFormatForm({ ...formatForm, chapters_count: e.target.value })} />
                    </div>
                    <div>
                      <Label>Free Preview %</Label>
                      <Input type="number" min={0} max={100} value={formatForm.preview_percentage ?? ""} onChange={(e) => setFormatForm({ ...formatForm, preview_percentage: e.target.value })} placeholder="Default: 15%" />
                      <p className="text-[10px] text-muted-foreground mt-1">How much can be listened for free before paywall (0-100)</p>
                    </div>
                    <div>
                      <Label>ISBN (Optional)</Label>
                      <Input value={formatForm.isbn || ""} onChange={(e) => setFormatForm({ ...formatForm, isbn: e.target.value })} placeholder="e.g. 978-3-16-148410-0" />
                      <p className="text-[10px] text-muted-foreground mt-1">Leave blank if not available</p>
                    </div>
                    {formatForm.id && (
                      <div className="col-span-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openTracks(formatForm.id)}>
                          <Music className="h-3 w-3 mr-1.5" />Manage Audio Tracks
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="hardcopy" className="col-span-2 mt-0 grid grid-cols-2 gap-3">
                    <div>
                      <Label>Current Stock</Label>
                      <Input type="number" value={formatForm.stock_count || ""} onChange={(e) => setFormatForm({ ...formatForm, stock_count: e.target.value })} />
                      {formatForm.id && formats.find(f => f.id === formatForm.id)?.stock_count != null && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Saved: {formats.find(f => f.id === formatForm.id)?.stock_count ?? 0}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Binding</Label>
                      <Select value={formatForm.binding || ""} onValueChange={(v) => setFormatForm({ ...formatForm, binding: v })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paperback">Paperback</SelectItem>
                          <SelectItem value="hardcover">Hardcover</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Pages</Label><Input type="number" value={formatForm.pages || ""} onChange={(e) => setFormatForm({ ...formatForm, pages: e.target.value })} /></div>
                    <div>
                      <Label>Weight (kg)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="50"
                        value={formatForm.weight_kg_per_copy ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormatForm({
                            ...formatForm,
                            weight_kg_per_copy: val,
                            weight: val ? `${val} kg` : "",
                          });
                        }}
                        placeholder="e.g. 0.3"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Example: 0.3 = 300g, 1.5 = 1500g</p>
                      {formatForm.weight_kg_per_copy && Number(formatForm.weight_kg_per_copy) > 10 && (
                        <p className="text-[10px] text-amber-500 mt-0.5">⚠ Over 10kg — please verify this is correct</p>
                      )}
                    </div>
                    <div><Label>Dimensions</Label><Input value={formatForm.dimensions || ""} onChange={(e) => setFormatForm({ ...formatForm, dimensions: e.target.value })} /></div>
                    <div><Label>Delivery Days</Label><Input type="number" value={formatForm.delivery_days || ""} onChange={(e) => setFormatForm({ ...formatForm, delivery_days: e.target.value })} /></div>
                    <div className="col-span-2">
                      <Label>ISBN (Optional)</Label>
                      <Input value={formatForm.isbn || ""} onChange={(e) => setFormatForm({ ...formatForm, isbn: e.target.value })} placeholder="e.g. 978-3-16-148410-0" />
                      <p className="text-[10px] text-muted-foreground mt-1">Leave blank if not available</p>
                    </div>
                    
                    {/* Unit Cost (Buying Price) */}
                    <div className="col-span-2 p-3 rounded-lg border border-border/30 bg-accent/5 space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-orange-400" />
                        Unit Cost / Buying Price (৳)
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={formatForm.unit_cost ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setFormatForm({ ...formatForm, unit_cost: raw === "" ? "" : raw, unit_cost_manual: true });
                            }}
                            placeholder="e.g. 120"
                            className="h-8 text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Actual purchase cost per unit. Used for profit & ledger calculations.
                          </p>
                        </div>
                        <div className="flex flex-col justify-center">
                          {(() => {
                            const orig = Number(formatForm.original_price) || 0;
                            const comm = Number(formatForm.publisher_commission_percent) || 0;
                            const autoCalc = orig > 0 && comm > 0 ? Math.round(orig - (orig * comm / 100)) : 0;
                            const currentUC = Number(formatForm.unit_cost) || 0;
                            const isManual = formatForm.unit_cost_manual && currentUC > 0 && autoCalc > 0 && currentUC !== autoCalc;
                            return (
                              <>
                                {autoCalc > 0 && (
                                  <p className="text-[10px] text-muted-foreground">
                                    Auto-calculated: ৳{autoCalc} ({100 - comm}% of ৳{orig})
                                    {isManual && <span className="text-amber-500 ml-1">(overridden)</span>}
                                  </p>
                                )}
                                {autoCalc > 0 && currentUC !== autoCalc && (
                                  <button
                                    type="button"
                                    className="text-[10px] text-primary hover:underline text-left mt-0.5"
                                    onClick={() => setFormatForm({ ...formatForm, unit_cost: String(autoCalc), unit_cost_manual: false })}
                                  >
                                    Reset to auto-calculated ৳{autoCalc}
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Default Packaging Cost */}
                      <div className="mt-2">
                        <Label className="text-xs">Default Packaging Cost (৳)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={formatForm.default_packaging_cost ?? ""}
                          onChange={(e) => setFormatForm({ ...formatForm, default_packaging_cost: e.target.value === "" ? "" : e.target.value })}
                          placeholder="e.g. 10"
                          className="h-8 text-sm max-w-[200px]"
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Auto-fills packaging cost in orders</p>
                      </div>
                    </div>

                    {/* Record purchase in ledger toggle */}
                    <div className="col-span-2 space-y-2 p-3 rounded-lg border border-border/30 bg-accent/5">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="record-purchase-ledger"
                          checked={recordPurchaseInLedger}
                          onCheckedChange={(v) => {
                            setRecordPurchaseInLedger(!!v);
                            if (!v) setPurchaseQty("");
                          }}
                        />
                        <div className="space-y-0.5 flex-1">
                          <label htmlFor="record-purchase-ledger" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                            <BookMarked className="h-3.5 w-3.5 text-primary" />
                            Record Stock Purchase in Ledger
                          </label>
                          <p className="text-[10px] text-muted-foreground">
                            Log the <strong>newly purchased quantity</strong> as an inventory expense. Does not use full stock count.
                          </p>
                        </div>
                      </div>
                      {recordPurchaseInLedger && (
                        <div className="ml-7 space-y-2">
                          <div>
                            <Label className="text-xs">Purchase Quantity (new copies bought)</Label>
                            <Input
                              type="number"
                              min="1"
                              value={purchaseQty}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPurchaseQty(val);
                                // Auto-increment stock_count
                                const savedStock = Number(formats.find(f => f.id === formatForm.id)?.stock_count) || 0;
                                const addedQty = Number(val) || 0;
                                if (addedQty > 0) {
                                  setFormatForm((prev: any) => ({ ...prev, stock_count: String(savedStock + addedQty) }));
                                }
                              }}
                              placeholder="e.g. 50"
                              className="h-8 text-sm max-w-[200px]"
                            />
                          </div>
                          {(Number(purchaseQty) || 0) > 0 && (Number(formatForm.unit_cost) || 0) > 0 && (
                            <p className="text-[10px] text-emerald-500 font-medium">
                              Will record ৳{((Number(formatForm.unit_cost) || 0) * (Number(purchaseQty) || 0)).toLocaleString()} as inventory expense
                              ({purchaseQty} × ৳{Number(formatForm.unit_cost) || 0})
                            </p>
                          )}
                          {(Number(purchaseQty) || 0) > 0 && !(Number(formatForm.unit_cost) || 0) && (
                            <p className="text-[10px] text-destructive">
                              ⚠ Set Unit Cost above to record expense
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedBookId && (
                      <div className="col-span-2">
                      <HardcopyProfitCalculator
                        bookId={selectedBookId}
                        originalPrice={Number(formatForm.original_price) || 0}
                        discountPercent={Number(formatForm.discount) || 0}
                        publisherCommissionPercent={Number(formatForm.publisher_commission_percent) || 0}
                        onCommissionChange={(v) => setFormatForm({ ...formatForm, publisher_commission_percent: v })}
                      />
                      <SmartPricingAssistant
                        originalPrice={Number(formatForm.original_price) || 0}
                        publisherCommissionPercent={Number(formatForm.publisher_commission_percent) || 0}
                        currentDiscount={Number(formatForm.discount) || 0}
                        onApplySuggestion={(price, discount) => {
                          setFormatForm({ ...formatForm, price: price, discount: Math.round(discount * 100) / 100 });
                          toast.success(`Suggested price ৳${price} applied (${discount.toFixed(1)}% discount)`);
                        }}
                      />
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
              <Button onClick={saveFormat} className="w-full mt-4" disabled={!formatsLoaded || formatsLoading}>{formatForm.id ? "Update" : "Add"} Format</Button>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Audio Tracks dialog */}
      <Dialog open={tracksOpen} onOpenChange={setTracksOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-primary" />
              Audio Tracks
            </DialogTitle>
          </DialogHeader>

          {/* Pricing summary */}
          {tracks.length > 0 && (
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

          {tracks.length > 0 && (
            <div className="space-y-0">
              {/* Table header */}
              <div className="grid grid-cols-[2rem_1fr_5rem_5rem_4.5rem_auto] items-center gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/30">
                <span>#</span>
                <span>Title</span>
                <span>Duration</span>
                <span>Price</span>
                <span>Preview</span>
                <span>Actions</span>
              </div>
              {tracks.map((t: any) => {
                const chapterCost = t.is_preview ? 0 : (t.chapter_price ?? DEFAULT_CHAPTER_PRICE);
                const isDefault = !t.is_preview && t.chapter_price === null;
                return (
                  <div
                    key={t.id}
                    className="grid grid-cols-[2rem_1fr_5rem_5rem_4.5rem_auto] items-center gap-2 px-3 py-2.5 border-b border-border/10 hover:bg-secondary/30"
                  >
                    {/* Track number */}
                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {t.track_number}
                    </div>

                    {/* Title + inline edit */}
                    <div className="min-w-0">
                      {editingTrackId === t.id ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={editingTrackTitle}
                              onChange={e => setEditingTrackTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") renameTrack(t.id); if (e.key === "Escape") setEditingTrackId(null); }}
                              className="h-7 text-sm"
                              placeholder="Track title"
                              autoFocus
                            />
                            <Input
                              value={editingTrackPrice}
                              onChange={e => setEditingTrackPrice(e.target.value)}
                              className="h-7 text-sm w-24"
                              placeholder={String(DEFAULT_CHAPTER_PRICE)}
                              type="number"
                              min="1"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7" onClick={() => renameTrack(t.id)}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingTrackId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm font-medium truncate">{t.title}</p>
                      )}
                    </div>

                    {/* Duration */}
                    <span className="text-xs text-muted-foreground truncate">{t.duration || "—"}</span>

                    {/* Price column */}
                    <div
                      className="text-xs font-medium flex items-center gap-0.5 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (editingTrackId !== t.id) {
                          setEditingTrackId(t.id);
                          setEditingTrackTitle(t.title);
                          setEditingTrackPrice(t.chapter_price ? String(t.chapter_price) : "");
                        }
                      }}
                      title="Click to edit price"
                    >
                      {t.is_preview ? (
                        <span className="text-emerald-400">Free</span>
                      ) : (
                        <span className={`flex items-center gap-0.5 ${isDefault ? "text-muted-foreground" : "text-primary"}`}>
                          🪙 {chapterCost}
                          {isDefault && <span className="text-[9px] opacity-60">(def)</span>}
                        </span>
                      )}
                    </div>

                    {/* Preview */}
                    <div className="flex justify-center">
                      {t.is_preview ? (
                        <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400">✓</Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingTrackId(t.id); setEditingTrackTitle(t.title); setEditingTrackPrice(t.chapter_price ? String(t.chapter_price) : ""); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteTrack(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {addingTrack ? (
            <Card className="border-border/30">
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label>Chapter Title *</Label>
                  <Input
                    value={trackForm.title}
                    onChange={e => setTrackForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={`Chapter ${tracks.length + 1}`}
                  />
                </div>
                <div>
                  <Label>Chapter Price (coins)</Label>
                  <Input
                    value={trackForm.chapter_price}
                    onChange={e => setTrackForm(f => ({ ...f, chapter_price: e.target.value }))}
                    placeholder={`Default: ${DEFAULT_CHAPTER_PRICE}`}
                    type="number"
                    min="1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank for default ({DEFAULT_CHAPTER_PRICE} coins ≈ ৳{(DEFAULT_CHAPTER_PRICE * 0.05).toFixed(0)})</p>
                </div>
                <div>
                  <Label>Media File (MP3 / M4A / MP4) *</Label>
                  <input ref={singleTrackInputRef} type="file" accept={ACCEPTED_FILE_INPUT} className="hidden" onChange={handleSingleTrackUpload} />
                  <div className="flex items-center gap-3 mt-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => singleTrackInputRef.current?.click()} disabled={uploadingTrack}>
                      {uploadingTrack ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload File</>}
                    </Button>
                    {trackForm.audio_url && (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {uploadedMediaType === "video" ? "Video" : "Audio"} uploaded {trackForm.duration && `• ${trackForm.duration}`}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Audio: max 100MB • Video: max 500MB</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveNewTrack} disabled={savingTrack} className="flex-1">
                    {savingTrack ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Chapter"}
                  </Button>
                  <Button variant="outline" onClick={() => { setAddingTrack(false); setTrackForm({ title: "", audio_url: "", duration: "", chapter_price: "" }); }}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-2 p-4 border border-dashed border-border/40 rounded-lg text-center">
              <Button variant="outline" onClick={() => setAddingTrack(true)}>
                <Plus className="h-4 w-4 mr-2" />Add Chapter
              </Button>
              <p className="text-[10px] text-muted-foreground mt-2">Add chapters one at a time with title and price</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
