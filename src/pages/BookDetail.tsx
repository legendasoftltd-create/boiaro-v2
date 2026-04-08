import { useParams, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
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

function buildMasterBook(dbBook: any, formats: any[], narrators: any[], contributors: any[] = []): MasterBook & { allNarrators: Narrator[] } {
  const author: Author = dbBook.authors ? {
    id: dbBook.author_id || "",
    name: dbBook.authors.name || "",
    nameEn: dbBook.authors.name_en || "",
    avatar: dbBook.authors.avatar_url || "",
    bio: dbBook.authors.bio || "",
    genre: dbBook.authors.genre || "",
    booksCount: 0,
    followers: "0",
    isFeatured: dbBook.authors.is_featured || false,
  } : { id: "", name: "", nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false }

  const publisher: Publisher = dbBook.publishers ? {
    id: dbBook.publisher_id || "",
    name: dbBook.publishers.name || "",
    nameEn: dbBook.publishers.name_en || "",
    logo: dbBook.publishers.logo_url || "",
    description: dbBook.publishers.description || "",
    booksCount: 0,
    isVerified: dbBook.publishers.is_verified || false,
  } : { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false }

  const category: Category = dbBook.categories ? {
    id: dbBook.category_id || "",
    name: dbBook.categories.name || "",
    nameBn: dbBook.categories.name_bn || "",
    icon: dbBook.categories.icon || "📚",
    count: "0",
    color: dbBook.categories.color || "#888",
  } : { id: "", name: "", nameBn: "", icon: "📚", count: "0", color: "#888" }

  const ebookFmt = formats.find(f => f.format === "ebook")
  const audiobookFmt = formats.find(f => f.format === "audiobook")
  const hardcopyFmt = formats.find(f => f.format === "hardcopy")

  // Collect ALL narrators from both book_formats.narrator_id and book_contributors
  const getAllNarrators = (): Narrator[] => {
    const seen = new Set<string>()
    const result: Narrator[] = []

    const addNarrator = (n: Narrator) => {
      if (n.id && !seen.has(n.id)) {
        seen.add(n.id)
        result.push(n)
      }
    }

    // 1. Narrator from book_formats.narrator_id
    const audiobookFmt = formats.find(f => f.format === "audiobook")
    if (audiobookFmt?.narrator_id) {
      const n = narrators.find((nr: any) => nr.id === audiobookFmt.narrator_id)
      if (n) {
        addNarrator({
          id: n.id, name: n.name, nameEn: n.name_en || "", avatar: n.avatar_url || "",
          bio: n.bio || "", specialty: n.specialty || "", audiobooksCount: 0,
          listeners: "0", rating: n.rating || 0, isFeatured: n.is_featured || false,
        })
      }
    }

    // 2. All narrators from book_contributors
    const narratorContributors = contributors.filter((contrib: any) => {
      const role = String(contrib.role || "").toLowerCase()
      const format = String(contrib.format || "").toLowerCase()
      return role === "narrator" && (format === "audiobook" || format === "" || !contrib.format)
    })

    for (const contrib of narratorContributors) {
      const profile = Array.isArray(contrib.profiles) ? contrib.profiles[0] : contrib.profiles
      const matchedNarrator = narrators.find((nr: any) => nr.user_id === contrib.user_id)
      const displayName = profile?.display_name || matchedNarrator?.name || "Narrator"
      const narratorId = matchedNarrator?.id || contrib.user_id || ""

      addNarrator({
        id: narratorId,
        name: displayName,
        nameEn: matchedNarrator?.name_en || "",
        avatar: matchedNarrator?.avatar_url || "",
        bio: matchedNarrator?.bio || "",
        specialty: matchedNarrator?.specialty || "",
        audiobooksCount: 0,
        listeners: "0",
        rating: matchedNarrator?.rating || 0,
        isFeatured: matchedNarrator?.is_featured || false,
      })
    }

    return result
  }

  const allNarrators = getAllNarrators()
  

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
      chapters: audiobookFmt.chapters_count || 0,
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

  return {
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
}

export default function BookDetail() {
  const { slug, bookId: shortId } = useParams<{ slug?: string; bookId?: string }>()
  const navigate = useNavigate()
  const { trackBookView } = useActivityTracker()
  const [book, setBook] = useState<MasterBook | null>(null)
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [bookId, setBookId] = useState("")
  const engagement = useBookEngagement(bookId)

  const lookupKey = slug || shortId

  useEffect(() => {
    if (!lookupKey) { setNotFound(true); setLoading(false); return }

    const fetchBook = async () => {
      // Try database first — lookup by slug or by ID
      const SAFE_AUTHORS = "id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id";
      const SAFE_PUBLISHERS = "id, name, name_en, logo_url, description, is_verified, is_featured, is_trending, priority, status, user_id";
      
      let dbBook: any = null
      
      if (shortId) {
        // Short URL: lookup by ID
        const { data } = await supabase
          .from("books")
          .select(`*, authors(${SAFE_AUTHORS}), publishers(${SAFE_PUBLISHERS}), categories(*)`)
          .eq("id", shortId)
          .eq("submission_status", "approved")
          .maybeSingle()
        dbBook = data
      } else {
        // SEO URL: lookup by slug
        const { data } = await supabase
          .from("books")
          .select(`*, authors(${SAFE_AUTHORS}), publishers(${SAFE_PUBLISHERS}), categories(*)`)
          .eq("slug", slug!)
          .eq("submission_status", "approved")
          .maybeSingle()
        dbBook = data
      }

      if (dbBook) {
        // Fetch formats + contributors in parallel
        const [fmtRes, contribRes] = await Promise.all([
          supabase.from("book_formats_public").select("id, book_id, format, price, original_price, discount, pages, duration, file_size, chapters_count, preview_chapters, preview_percentage, audio_quality, binding, dimensions, weight, delivery_days, in_stock, stock_count, is_available, narrator_id, submission_status, created_at, updated_at").eq("book_id", dbBook.id),
          supabase.from("book_contributors").select("*, profiles(display_name)").eq("book_id", dbBook.id),
        ])
        const formats = fmtRes.data || []
        const contributors = contribRes.data || []

        if (import.meta.env.DEV) {
          console.debug("[BookDetail] Fetched formats and contributors", {
            bookId: dbBook.id,
            formats,
            contributors,
          })
        }

        // Fetch narrators for audiobook formats
        const audiobookFmt = formats.find(f => f.format === "audiobook")
        let narrators: any[] = []
        const contributorNarratorUserIds = contributors
          .filter((contrib: any) => {
            const role = String(contrib.role || "").toLowerCase()
            const format = String(contrib.format || "").toLowerCase()
            return role === "narrator" && (format === "audiobook" || format === "" || format === "null" || format === "all" || !contrib.format) && Boolean(contrib.user_id)
          })
          .map((contrib: any) => contrib.user_id)

        const SAFE_NARRATORS = "id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending, priority, status, user_id";
        const narratorQueries: any[] = []
        if (audiobookFmt?.narrator_id) {
          narratorQueries.push(supabase.from("narrators").select(SAFE_NARRATORS).eq("id", audiobookFmt.narrator_id))
        }
        if (contributorNarratorUserIds.length > 0) {
          narratorQueries.push(supabase.from("narrators").select(SAFE_NARRATORS).in("user_id", contributorNarratorUserIds))
        }

        if (narratorQueries.length > 0) {
          const narratorResults = await Promise.all(narratorQueries)
          const merged = narratorResults.flatMap((result) => result.data || [])
          narrators = merged.filter((item, index, self) => self.findIndex((n: any) => n.id === item.id) === index)
        }

        // Fetch audiobook tracks if audiobook format exists
        let mappedTracks: AudioTrack[] = []

        if (audiobookFmt) {
          const { data: tracksData } = await supabase
            .from("audiobook_tracks")
            .select("*")
            .eq("book_format_id", audiobookFmt.id)
            .order("track_number", { ascending: true })

          if (tracksData && tracksData.length > 0) {
            mappedTracks = tracksData
              .filter((t: any) => (t.is_active ?? true))
              .map((t: any) => {
                const rawPath = (t.storage_path || t.file_url || t.audio_url || "").trim() || null
                const storagePath = normalizeAudioSource(rawPath)
                const mimeType = normalizeAudioMimeType(t.mime_type || guessAudioMimeType(storagePath))

                if (!storagePath) return null
                const supportedMimes = ["audio/mpeg", "audio/mp4", "video/mp4"]
                if (mimeType && !supportedMimes.includes(mimeType)) {
                  if (import.meta.env.DEV) {
                    console.debug("[BookDetail] Skipping unsupported track", {
                      trackId: t.id,
                      trackNumber: t.track_number,
                      title: t.title,
                      rawPath,
                      mimeType,
                    })
                  }
                  return null
                }

                return {
                  id: t.id,
                  trackNumber: t.track_number,
                  title: t.title,
                  duration: t.duration || "0:00",
                  audioUrl: storagePath,
                  storagePath,
                  mimeType,
                  mediaType: (t.media_type as "audio" | "video") || (mimeType === "video/mp4" ? "video" : "audio"),
                  isActive: t.is_active ?? true,
                  isPreview: t.is_preview || false,
                  chapterPrice: t.chapter_price != null ? Number(t.chapter_price) : undefined,
                }
              })
              .filter((t: AudioTrack | null): t is AudioTrack => Boolean((t?.audioUrl || "").trim()))

            if (import.meta.env.DEV) {
              console.debug("[BookDetail] Track mapping", {
                bookId: dbBook.id,
                formatId: audiobookFmt.id,
                rawTracks: tracksData,
                mappedTracks,
              })
            }
          }

          setAudioTracks(mappedTracks)
        } else {
          setAudioTracks([])
        }

        const masterBook = buildMasterBook(dbBook, formats, narrators, contributors)

        if (masterBook.formats.audiobook && mappedTracks.length > 0) {
          masterBook.formats.audiobook.chapters = mappedTracks.length
          if (!masterBook.formats.audiobook.duration) {
            masterBook.formats.audiobook.duration = mappedTracks[0]?.duration || "0:00"
          }
        }

        ;(masterBook as any).contributors = contributors
        setBook(masterBook)
        setBookId(dbBook.id)
        trackBookView(dbBook.id, dbBook.title)
        setLoading(false)
        return
      }

      // Fallback to static data
      const staticBook = staticBooks.find(b => b.slug === lookupKey || b.id === lookupKey)
      if (staticBook) {
        setBook(staticBook)
        setAudioTracks([])
      } else {
        setNotFound(true)
      }
      setLoading(false)
    }

    fetchBook()
  }, [lookupKey])

  useEffect(() => {
    if (!bookId) return
    engagement.trackRead()
  }, [bookId, engagement.trackRead])

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 pb-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </main>
    )
  }

  if (notFound || !book) {
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