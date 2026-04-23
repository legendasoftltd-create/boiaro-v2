import { useParams, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { useActivityTracker } from "@/hooks/useActivityTracker"
import { useBookEngagement } from "@/hooks/useBookEngagement"
import { books as staticBooks } from "@/lib/data"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { BookDetailHero } from "@/components/book-detail/BookDetailHero"
import { BookFormatTabs } from "@/components/book-detail/BookFormatTabs"
import { BookReviews } from "@/components/book-detail/BookReviews"
import { RelatedBooks } from "@/components/book-detail/RelatedBooks"
import { BookComments } from "@/components/book-detail/BookComments"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import type { MasterBook, Author, Publisher, Category, Narrator } from "@/lib/types"
import type { AudioTrack } from "@/contexts/AudioPlayerContext"

function buildMasterBook(dbBook: any, contributors: any[] = []): { book: MasterBook & { allNarrators: Narrator[] }; audioTracks: AudioTrack[] } {
  const author: Author = dbBook.author ? {
    id: dbBook.author_id || "",
    name: dbBook.author.name || "",
    nameEn: dbBook.author.name_en || "",
    avatar: dbBook.author.avatar_url || "",
    bio: dbBook.author.bio || "",
    genre: dbBook.author.genre || "",
    booksCount: 0,
    followers: "0",
    isFeatured: dbBook.author.is_featured || false,
  } : { id: "", name: "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false }

  const publisher: Publisher = dbBook.publisher ? {
    id: dbBook.publisher_id || "",
    name: dbBook.publisher.name || "",
    nameEn: dbBook.publisher.name_en || "",
    logo: dbBook.publisher.logo_url || "",
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
  const ebookFmt = formats.find((f: any) => f.format === "ebook")
  const audiobookFmt = formats.find((f: any) => f.format === "audiobook")
  const hardcopyFmt = formats.find((f: any) => f.format === "hardcopy")

  // Collect narrators
  const seen = new Set<string>()
  const allNarrators: Narrator[] = []

  const addNarrator = (n: Narrator) => {
    if (n.id && !seen.has(n.id)) { seen.add(n.id); allNarrators.push(n) }
  }

  if (audiobookFmt?.narrator) {
    const n = audiobookFmt.narrator
    addNarrator({
      id: n.id, name: n.name, nameEn: n.name_en || "", avatar: n.avatar_url || "",
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
      name: contrib.display_name || "Narrator",
      nameEn: "",
      avatar: contrib.avatar_url || "",
      bio: "",
      specialty: "",
      audiobooksCount: 0,
      listeners: "0",
      rating: 0,
      isFeatured: false,
    })
  }

  // Build audio tracks from embedded format tracks
  let audioTracks: AudioTrack[] = []
  if (audiobookFmt?.audiobook_tracks?.length > 0) {
    audioTracks = audiobookFmt.audiobook_tracks
      .map((t: any) => {
        const rawPath = (t.audio_url || "").trim() || null
        const storagePath = normalizeAudioSource(rawPath)
        const mimeType = normalizeAudioMimeType(t.mime_type || guessAudioMimeType(storagePath))
        if (!storagePath) return null
        const supportedMimes = ["audio/mpeg", "audio/mp4", "video/mp4"]
        if (mimeType && !supportedMimes.includes(mimeType)) return null
        return {
          id: t.id,
          trackNumber: t.track_number,
          title: t.title,
          duration: t.duration || "0:00",
          audioUrl: storagePath,
          storagePath,
          mimeType,
          mediaType: (t.media_type as "audio" | "video") || (mimeType === "video/mp4" ? "video" : "audio"),
          isActive: t.status === "active",
          isPreview: t.is_preview || false,
          chapterPrice: t.chapter_price != null ? Number(t.chapter_price) : undefined,
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
      fileSize: ebookFmt.file_size || "N/A",
      previewChapters: ebookFmt.preview_chapters || 0,
      previewPercentage: ebookFmt.preview_percentage ?? null,
    }
  }

  if (audiobookFmt) {
    bookFormats.audiobook = {
      available: audiobookFmt.is_available !== false,
      price: Number(audiobookFmt.price) || 0,
      duration: audiobookFmt.duration || "0h 0m",
      narrator: allNarrators[0] || { id: "", name: "Narrator not assigned", nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", rating: 0, isFeatured: false },
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
    publisher,
    category,
    cover: dbBook.cover_url || "",
    description: dbBook.description || "",
    descriptionBn: dbBook.description_bn || dbBook.description || "",
    rating: Number(dbBook.rating) || 0,
    reviewsCount: dbBook.reviews_count || 0,
    totalReads: String(dbBook.total_reads || 0),
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
  const { trackBookView } = useActivityTracker()

  const lookupKey = slug || shortId
  const queryInput = shortId ? { id: shortId } : { slug: slug! }

  const { data: dbBook, isLoading, isError } = trpc.books.detail.useQuery(
    queryInput,
    { enabled: !!lookupKey, retry: false }
  )

  const bookId = dbBook?.id ?? ""
  const engagement = useBookEngagement(bookId)

  useEffect(() => {
    if (dbBook) trackBookView(dbBook.id, dbBook.title)
  }, [dbBook?.id])

  useEffect(() => {
    if (!bookId) return
    engagement.trackRead()
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
        <BookFormatTabs book={book} audioTracks={audioTracks} />
        <BookReviews book={book} onReviewChange={engagement.refreshReviewStats} />
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
  if (normalized.endsWith(".mp4")) return "video/mp4"
  return null
}

function normalizeAudioMimeType(mimeType: string | null): string | null {
  if (!mimeType) return null
  const normalized = mimeType.toLowerCase().trim()
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "audio/mpeg"
  return normalized
}

function normalizeAudioSource(source: string | null): string | null {
  if (!source) return null
  const trimmed = source.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    const markers = [
      "/storage/v1/object/public/audiobooks/",
      "/storage/v1/object/sign/audiobooks/",
      "/storage/v1/object/authenticated/audiobooks/",
    ]
    for (const marker of markers) {
      if (trimmed.includes(marker)) {
        const split = trimmed.split(marker)[1]
        if (!split) return null
        return decodeURIComponent(split.split("?")[0] || "").replace(/^\/+/, "")
      }
    }
    return trimmed
  }
  return trimmed.replace(/^\/+/, "")
}
