import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useEffect } from "react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { useActivityTracker } from "@/hooks/useActivityTracker"
import { useBookEngagement } from "@/hooks/useBookEngagement"
import { books as staticBooks } from "@/lib/data"
import { toMediaUrl } from "@/lib/mediaUrl"
import { formatDuration } from "@/lib/duration"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { BookDetailHero } from "@/components/book-detail/BookDetailHero"
import { BookFormatTabs } from "@/components/book-detail/BookFormatTabs"
import { BookReviews } from "@/components/book-detail/BookReviews"
import { RelatedBooks } from "@/components/book-detail/RelatedBooks"
import { BookComments } from "@/components/book-detail/BookComments"
import { Button } from "@/components/ui/button"
import { AdBannerBlock } from "@/components/AdBannerBlock"
import { ArrowLeft, Loader2 } from "lucide-react"
import type { MasterBook, Author, Publisher, Category, Narrator } from "@/lib/types"
import type { AudioTrack } from "@/contexts/AudioPlayerContext"

/** Converts raw bytes string ("5242880") → "5.0 MB", leaves "5.0 MB" unchanged */
function normalizeFileSize(raw: string | null | undefined): string {
  if (!raw) return "N/A";
  if (/^\d+$/.test(raw.trim())) {
    const mb = Number(raw) / (1024 * 1024);
    return mb < 0.1 ? `${Math.round(Number(raw) / 1024)} KB` : `${mb.toFixed(1)} MB`;
  }
  return raw;
}

function buildMasterBook(dbBook: any, contributors: any[] = []): { book: MasterBook & { allNarrators: Narrator[] }; audioTracks: AudioTrack[] } {
  const author: Author = dbBook.author ? {
    id: dbBook.author_id || "",
    name: dbBook.author.name || "",
    nameEn: dbBook.author.name_en || "",
    avatar: toMediaUrl(dbBook.author.avatar_url) || "",
    bio: dbBook.author.bio || "",
    genre: dbBook.author.genre || "",
    booksCount: 0,
    followers: "0",
    isFeatured: dbBook.author.is_featured || false,
  } : { id: "", name: "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false }

  const translator: Author = dbBook.translator ? {
    id: dbBook.translator_id || "",
    name: dbBook.translator.name || "",
    nameEn: dbBook.translator.name_en || "",
    avatar: toMediaUrl(dbBook.translator.avatar_url) || "",
    bio: dbBook.translator.bio || "",
    genre: dbBook.translator.genre || "",
    booksCount: 0,
    followers: "0",
    isFeatured: dbBook.translator.is_featured || false,
  } : { id: "", name: "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false }

  const publisher: Publisher = dbBook.publisher ? {
    id: dbBook.publisher_id || "",
    name: dbBook.publisher.name || "",
    nameEn: dbBook.publisher.name_en || "",
    logo: toMediaUrl(dbBook.publisher.logo_url) || "",
    description: dbBook.publisher.description || "",
    booksCount: 0,
    isVerified: dbBook.publisher.is_verified || false,
  } : { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false }

  const category: Category = dbBook.category ? {
    id: dbBook.category_id || "",
    name: dbBook.category.name || "",
    nameBn: dbBook.category.name_bn || "",
    icon: dbBook.category.icon || "📚",
    count: "0",
    color: dbBook.category.color || "#888",
  } : { id: "", name: "", nameBn: "", icon: "📚", count: "0", color: "#888" }

  const formats: any[] = dbBook.formats || []
  const pickFormat = (type: "ebook" | "audiobook" | "hardcopy") => {
    const candidates = formats.filter((f: any) => f.format === type)
    if (candidates.length === 0) return undefined
    // Prefer available format if there are duplicate rows for same type.
    return candidates.find((f: any) => f.is_available !== false) || candidates[0]
  }
  const ebookFmt = pickFormat("ebook")
  const audiobookFmt = pickFormat("audiobook")
  const hardcopyFmt = pickFormat("hardcopy")

  // Collect narrators — deduplicate by narrator.id and by narrator.user_id === contributor.user_id.
  // This correctly identifies the same person without false-positives from name matching.
  const seenNarratorIds = new Set<string>()
  const seenNarratorUserIds = new Set<string>()
  const allNarrators: Narrator[] = []

  const addNarrator = (n: Narrator & { userId?: string }) => {
    if (!n.id) return
    if (seenNarratorIds.has(n.id)) return
    if (n.userId && seenNarratorUserIds.has(n.userId)) return
    seenNarratorIds.add(n.id)
    if (n.userId) seenNarratorUserIds.add(n.userId)
    allNarrators.push(n)
  }

  if (audiobookFmt?.narrator) {
    const n = audiobookFmt.narrator
    addNarrator({
      id: n.id,
      userId: n.user_id || undefined,
      name: n.name || n.name_en || "",
      nameEn: n.name_en || "",
      avatar: toMediaUrl(n.avatar_url) || "",
      bio: n.bio || "", specialty: n.specialty || "", audiobooksCount: 0,
      listeners: "0", rating: n.rating || 0, isFeatured: n.is_featured || false,
    })
  }

  // Admin-selected multi-narrator list (BookFormat.narrator_ids, resolved server-side)
  for (const n of audiobookFmt?.narrators || []) {
    addNarrator({
      id: n.id,
      userId: n.user_id || undefined,
      name: n.name || n.name_en || "",
      nameEn: n.name_en || "",
      avatar: toMediaUrl(n.avatar_url) || "",
      bio: n.bio || "", specialty: n.specialty || "", audiobooksCount: 0,
      listeners: "0", rating: n.rating || 0, isFeatured: n.is_featured || false,
    })
  }

  for (const contrib of contributors.filter((c: any) => {
    const role = String(c.role || "").toLowerCase()
    const fmt = String(c.format || "").toLowerCase()
    return role === "narrator" && (fmt === "audiobook" || fmt === "" || !c.format)
  })) {
    addNarrator({
      id: contrib.user_id || "",
      userId: contrib.user_id || undefined,
      name: contrib.display_name || "Narrator",
      nameEn: "",
      avatar: toMediaUrl(contrib.avatar_url) || "",
      bio: "",
      specialty: "",
      audiobooksCount: 0,
      listeners: "0",
      rating: 0,
      isFeatured: false,
    })
  }

  // Build audio tracks from embedded format tracks.
  // Per-chapter pricing always wins: if the admin configured real chapter prices,
  // the book is never treated as free, even if the book-level is_free flag is on
  // (that flag is meant for books with no per-chapter pricing configured at all).
  const hasChapterPricing = audiobookFmt?.audiobook_tracks?.some((t: any) => Number(t.chapter_price) > 0 || Number(t.chapter_taka_price) > 0)
  const isBookFree = !hasChapterPricing && (Boolean(dbBook.is_free) || Number(audiobookFmt?.price ?? 0) <= 0)
  let audioTracks: AudioTrack[] = []
  if (audiobookFmt?.audiobook_tracks?.length > 0) {
    audioTracks = audiobookFmt.audiobook_tracks
      .map((t: any) => {
        // The API no longer returns audio_url — direct media locations are not
        // handed out with the catalogue. `has_audio` says the chapter has a
        // file; the actual URL is fetched per-play through the access-checked
        // presigned route. (The `t.audio_url` fallback keeps this working
        // against an older server during a rolling deploy.)
        const rawPath = (t.audio_url || "").trim() || null
        const storagePath = normalizeAudioSource(rawPath)
        const hasSource = t.has_audio ?? Boolean(storagePath)
        const mimeType = normalizeAudioMimeType(t.mime_type || guessAudioMimeType(storagePath))
        if (!hasSource) return null
        const supportedMimes = ["audio/mpeg", "audio/mp4", "audio/wav", "video/mp4"]
        if (mimeType && !supportedMimes.includes(mimeType)) return null
        const isPreview = isBookFree || t.is_preview || false
        return {
          id: t.id,
          trackNumber: t.track_number,
          title: t.title,
          duration: t.duration || "0:00",
          audioUrl: storagePath,
          storagePath,
          hasSource,
          mimeType,
          mediaType: (t.media_type as "audio" | "video") || (mimeType === "video/mp4" ? "video" : "audio"),
          isActive: t.status === "active",
          isPreview,
          chapterPrice: isPreview ? undefined : (t.chapter_price != null ? Number(t.chapter_price) : undefined),
          chapterTakaPrice: isPreview ? undefined : (t.chapter_taka_price != null ? Number(t.chapter_taka_price) : undefined),
        } as AudioTrack
      })
      .filter((t: AudioTrack | null): t is AudioTrack => Boolean((t?.audioUrl || "").trim()))
  }

  const bookFormats: MasterBook["formats"] = {}

  if (ebookFmt) {
    bookFormats.ebook = {
      available: ebookFmt.is_available !== false,
      price: Number(ebookFmt.price) || 0,
      pages: ebookFmt.pages || 0,
      fileSize: normalizeFileSize(ebookFmt.file_size),
      previewChapters: ebookFmt.preview_chapters || 0,
      previewPercentage: ebookFmt.preview_percentage ?? null,
    }
  }

  if (audiobookFmt) {
    bookFormats.audiobook = {
      available: audiobookFmt.is_available !== false,
      price: Number(audiobookFmt.price) || 0,
      duration: formatDuration(audiobookFmt.duration),
      narrator: allNarrators[0] || { id: "", name: "Narrator not assigned", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
      narrators: allNarrators,
      chapters: audioTracks.length || audiobookFmt.chapters_count || 0,
      quality: audiobookFmt.audio_quality || "standard",
      previewPercentage: audiobookFmt.preview_percentage ?? null,
    }
  }

  if (hardcopyFmt) {
    bookFormats.hardcopy = {
      available: hardcopyFmt.is_available !== false,
      price: Number(hardcopyFmt.price) || 0,
      originalPrice: hardcopyFmt.original_price ? Number(hardcopyFmt.original_price) : undefined,
      discount: hardcopyFmt.discount || undefined,
      pages: hardcopyFmt.pages || 0,
      binding: hardcopyFmt.binding || "paperback",
      weight: hardcopyFmt.weight || "N/A",
      dimensions: hardcopyFmt.dimensions || "N/A",
      inStock: hardcopyFmt.in_stock !== false,
      stockCount: hardcopyFmt.stock_count || 0,
      deliveryDays: hardcopyFmt.delivery_days || 3,
    }
  }

  const book: MasterBook & { allNarrators: Narrator[] } = {
    id: dbBook.id,
    title: dbBook.title,
    titleEn: dbBook.title_en || "",
    slug: dbBook.slug,
    author,
    translator,
    publisher,
    category,
    cover: toMediaUrl(dbBook.cover_url) || "",
    description: dbBook.description || "",
    descriptionBn: dbBook.description_bn || dbBook.description || "",
    rating: Number(dbBook.rating) || 0,
    reviewsCount: dbBook.reviews_count || 0,
    totalReads: String(dbBook.total_reads || 0),
    totalListens: String(dbBook.total_listens || 0),
    publishedDate: dbBook.published_date || "",
    language: dbBook.language || "bn",
    tags: dbBook.tags || [],
    isFeatured: dbBook.is_featured || false,
    isNew: dbBook.is_new || false,
    isBestseller: dbBook.is_bestseller || false,
    isFree: dbBook.is_free || false,
    formats: bookFormats,
    allNarrators,
  }

  return { book, audioTracks }
}

export default function BookDetail() {
  const { slug, bookId: shortId } = useParams<{ slug?: string; bookId?: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { trackBookView } = useActivityTracker()
  const utils = trpc.useUtils()

  const lookupKey = slug || shortId
  const queryInput = shortId ? { id: shortId } : { slug: slug! }

  const { data: dbBook, isLoading, isError } = trpc.books.detail.useQuery(
    queryInput,
    { enabled: !!lookupKey, retry: false }
  )

  const bookId = dbBook?.id ?? ""
  const engagement = useBookEngagement(bookId)

  // Returning from a chapter/full-audiobook payment redirect — the unlock happened
  // server-side during the gateway callback, but cached unlock/balance queries from
  // before the payment are stale, so the page would otherwise keep showing "locked"
  // until a manual refresh. Invalidate and clean the status param off the URL.
  useEffect(() => {
    const chapterStatus = searchParams.get("chapter_status")
    const audiobookStatus = searchParams.get("audiobook_status")
    const status = chapterStatus || audiobookStatus
    if (!status) return

    if (status === "success") {
      utils.wallet.userUnlocks.invalidate()
      utils.wallet.balance.invalidate()
      if (bookId) {
        utils.books.detail.invalidate(queryInput as any)
        utils.books.trackPrices.invalidate()
      }
      toast.success(chapterStatus ? "চ্যাপ্টার আনলক হয়েছে!" : "সম্পূর্ণ অডিওবুক আনলক হয়েছে!")
    } else if (status === "cancelled") {
      toast.info("পেমেন্ট বাতিল করা হয়েছে")
    } else {
      toast.error("পেমেন্ট ব্যর্থ হয়েছে")
    }

    const next = new URLSearchParams(searchParams)
    next.delete("chapter_status")
    next.delete("audiobook_status")
    setSearchParams(next, { replace: true })
  }, [searchParams, bookId])

  useEffect(() => {
    if (dbBook) trackBookView(dbBook.id, dbBook.title)
  }, [dbBook?.id])

  useEffect(() => {
    if (!dbBook) return;
    const title = `${dbBook.title} — BoiAro`;
    document.title = title;

    const setMeta = (property: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`) ||
               document.querySelector<HTMLMetaElement>(`meta[name="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(property.startsWith("og:") ? "property" : "name", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const coverUrl = dbBook.cover_url || "";
    const description = dbBook.description || dbBook.description_bn || "বইআরোতে এই বইটি পড়ুন।";
    const pageUrl = window.location.href;

    setMeta("og:title", dbBook.title);
    setMeta("og:description", description);
    setMeta("og:image", coverUrl);
    setMeta("og:url", pageUrl);
    setMeta("og:type", "book");
    setMeta("description", description);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", dbBook.title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", coverUrl);

    return () => { document.title = "BoiAro"; };
  }, [dbBook?.id])

  useEffect(() => {
    if (!bookId) return
    engagement.trackView()
  }, [bookId])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 pb-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </main>
    )
  }

  if (isError || !dbBook) {
    // Fallback to static data
    const staticBook = staticBooks.find(b => b.slug === lookupKey || b.id === lookupKey)
    if (staticBook) {
      return (
        <main className="min-h-screen bg-background">
          <Navbar />
          <div className="pt-20 lg:pt-24">
            <BookDetailHero book={staticBook} liveRating={0} liveReviewsCount={0} liveReads={0} />
            <BookFormatTabs book={staticBook} audioTracks={[]} />
            <BookReviews book={staticBook} onReviewChange={() => {}} />
            <BookComments bookId={staticBook.id} />
            <RelatedBooks book={staticBook} allBooks={[]} />
          </div>
          <Footer />
        </main>
      )
    }

    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 pb-20 text-center animate-fade-in-up">
          <h1 className="text-3xl font-serif font-bold text-foreground mb-4">Book Not Found</h1>
          <p className="text-muted-foreground mb-8">The book you're looking for doesn't exist.</p>
          <Button onClick={() => navigate("/")} variant="outline" className="btn-gold-outline gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Button>
        </div>
      </main>
    )
  }

  const { book, audioTracks } = buildMasterBook(dbBook, (dbBook as any).contributors || [])
  ;(book as any).contributors = (dbBook as any).contributors || []

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 lg:pt-24">
        <BookDetailHero
          book={book}
          liveRating={engagement.liveRating}
          liveReviewsCount={engagement.liveReviewsCount}
          liveReads={engagement.liveReads}
        />
        <AdBannerBlock placementKey="book_detail_middle" />
        <BookFormatTabs book={book} audioTracks={audioTracks} />
        <BookReviews book={book} onReviewChange={engagement.refreshReviewStats} />
        <AdBannerBlock placementKey="book_detail_bottom" />
        <BookComments bookId={book.id} />
        <RelatedBooks book={book} allBooks={[]} />
      </div>
      <Footer />
    </main>
  )
}

function guessAudioMimeType(path: string | null): string | null {
  if (!path) return null
  const normalized = path.toLowerCase().split("?")[0]
  if (normalized.endsWith(".mp3")) return "audio/mpeg"
  if (normalized.endsWith(".m4a")) return "audio/mp4"
  if (normalized.endsWith(".aac")) return "audio/aac"
  if (normalized.endsWith(".wav")) return "audio/wav"
  if (normalized.endsWith(".mp4")) return "video/mp4"
  return null
}

function normalizeAudioMimeType(mimeType: string | null): string | null {
  if (!mimeType) return null
  const normalized = mimeType.toLowerCase().trim()
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "audio/mpeg"
  if (normalized === "audio/x-wav" || normalized === "audio/wave" || normalized === "audio/vnd.wave") return "audio/wav"
  return normalized
}

function normalizeAudioSource(source: string | null): string | null {
  if (!source) return null
  const trimmed = source.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return toMediaUrl(trimmed) || null
}
