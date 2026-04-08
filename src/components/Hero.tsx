import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Headphones, Package, ChevronLeft, ChevronRight } from "lucide-react"
import { useBooks } from "@/hooks/useBooks"
import { usePlatformStats } from "@/hooks/usePlatformStats"
import type { MasterBook } from "@/lib/types"

const SLIDE_INTERVAL = 6000

function HeroSlide({ book, isActive }: { book: MasterBook; isActive: boolean }) {
  const navigate = useNavigate()
  const hasEbook = book.formats.ebook?.available
  const hasAudiobook = book.formats.audiobook?.available
  const hasHardcopy = book.formats.hardcopy?.available

  return (
    <div
      className={`absolute inset-0 transition-[opacity,transform] duration-600 ease-out will-change-[opacity,transform] ${
        isActive ? "opacity-100 translate-x-0 z-10" : "opacity-0 translate-x-8 z-0 pointer-events-none"
      }`}
    >
      {/* Background image with gradient */}
      <div className="absolute inset-0">
          <img
            src={book.cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover scale-110 opacity-20"
            style={{ filter: "blur(4px)" }}
          />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/80" />
      </div>

      <div className="relative z-10 container mx-auto px-4 lg:px-8 h-full flex items-center">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 md:gap-8 lg:gap-16 w-full">
          {/* Text content */}
          <div className={`flex-1 max-w-2xl transition-all duration-700 delay-150 ${isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="flex items-center gap-2 mb-4">
              {book.isFeatured && (
                <Badge className="bg-primary/15 text-primary border-0 text-[11px] font-semibold tracking-wide">
                  ✦ সম্পাদকের পছন্দ
                </Badge>
              )}
              {book.isNew && (
                <Badge className="bg-red-500/15 text-red-400 border-0 text-[11px] font-semibold">
                  NEW
                </Badge>
              )}
              {book.isFree && (
                <Badge className="bg-green-500/15 text-green-400 border-0 text-[11px] font-semibold">
                  FREE
                </Badge>
              )}
            </div>

            <h1 className="text-xl md:text-4xl lg:text-5xl xl:text-6xl font-serif font-bold text-foreground leading-[1.1] mb-1.5 md:mb-3">
              {book.title}
            </h1>
            {book.titleEn && (
              <p className="text-lg md:text-xl text-muted-foreground/70 font-serif italic mb-4">{book.titleEn}</p>
            )}

            <p className="text-xs md:text-base text-muted-foreground leading-relaxed line-clamp-2 mb-3 md:mb-6 max-w-xl">
              {book.descriptionBn || book.description}
            </p>

            <div className="flex items-center gap-2 md:gap-4 mb-3 md:mb-6 text-[11px] md:text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{book.author.name}</span>
              {book.rating > 0 && (
                <span className="flex items-center gap-1">
                  <span className="text-primary">★</span> {book.rating}
                </span>
              )}
              {book.category.name && <span>{book.category.nameBn || book.category.name}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 md:gap-2.5">
              {hasEbook && (
                <Button
                  size="lg"
                  className="btn-gold px-3 md:px-6 h-8 md:h-12 text-[11px] md:text-sm gap-1 md:gap-2 rounded-lg md:rounded-xl"
                  onClick={() => navigate(`/read/${book.slug}`)}
                >
                  <BookOpen className="w-3.5 h-3.5 md:w-5 md:h-5" /> Read eBook
                </Button>
              )}
              {hasAudiobook && (
                <Button
                  size="lg"
                  className="bg-blue-500 text-foreground hover:bg-blue-600 font-semibold rounded-lg md:rounded-xl px-3 md:px-6 h-8 md:h-12 text-[11px] md:text-sm gap-1 md:gap-2 shadow-sm shadow-blue-500/20"
                  onClick={() => navigate(`/book/${book.slug}`)}
                >
                  <Headphones className="w-3.5 h-3.5 md:w-5 md:h-5" /> Listen Now
                </Button>
              )}
              {hasHardcopy && (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-foreground font-semibold rounded-lg md:rounded-xl px-3 md:px-6 h-8 md:h-12 text-[11px] md:text-sm gap-1 md:gap-2 transition-all"
                  onClick={() => navigate(`/book/${book.slug}`)}
                >
                  <Package className="w-3.5 h-3.5 md:w-5 md:h-5" /> Order Copy
                </Button>
              )}
              {!hasEbook && !hasAudiobook && !hasHardcopy && (
                <Button
                  size="lg"
                  className="btn-gold px-3 md:px-6 h-8 md:h-12 text-[11px] md:text-sm gap-1 md:gap-2 rounded-lg md:rounded-xl"
                  onClick={() => navigate(`/book/${book.slug}`)}
                >
                  View Details
                </Button>
              )}
            </div>
          </div>

          {/* Cover art — visible on all screens */}
          <div className={`flex justify-center lg:justify-end transition-all duration-700 delay-200 ${isActive ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
            <div className="relative w-[120px] sm:w-[160px] md:w-[200px] lg:w-[240px] xl:w-[280px]">
              <div className="aspect-[2/3] rounded-xl lg:rounded-2xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-border/30">
                <img src={book.cover} alt={book.title} className="w-full h-full object-cover" loading={isActive ? "eager" : "lazy"} decoding={isActive ? "sync" : "async"} fetchPriority={isActive ? "high" : "low"} sizes="(max-width: 640px) 120px, (max-width: 768px) 160px, (max-width: 1024px) 200px, 280px" />
              </div>
              {/* Format pills */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {hasEbook && <Badge className="bg-primary text-primary-foreground text-[10px] shadow-lg"><BookOpen className="w-3 h-3 mr-1" />eBook</Badge>}
                {hasAudiobook && <Badge className="bg-blue-500 text-foreground text-[10px] shadow-lg"><Headphones className="w-3 h-3 mr-1" />Audio</Badge>}
                {hasHardcopy && <Badge className="bg-emerald-500 text-foreground text-[10px] shadow-lg"><Package className="w-3 h-3 mr-1" />Print</Badge>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  const { featured, books } = useBooks()
  const { stats, formatCount } = usePlatformStats()
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Use featured books, or first 5 books as fallback
  const slides = (featured.length > 0 ? featured : books).slice(0, 5)

  const goTo = useCallback((idx: number) => {
    setCurrent((idx + slides.length) % slides.length)
  }, [slides.length])

  // Auto-advance
  useEffect(() => {
    if (paused || slides.length <= 1) return
    timerRef.current = setInterval(() => goTo(current + 1), SLIDE_INTERVAL)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [current, paused, goTo, slides.length])

  // Touch swipe — only capture horizontal gestures, let vertical scroll pass through
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchLocked = useRef<"none" | "horizontal" | "vertical">("none")
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchLocked.current = "none"
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchLocked.current !== "none") return
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current)
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current)
    if (dx > 10 || dy > 10) {
      touchLocked.current = dx > dy ? "horizontal" : "vertical"
      if (touchLocked.current === "horizontal") setPaused(true)
    }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchLocked.current === "horizontal") {
      const diff = touchStartX.current - e.changedTouches[0].clientX
      if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1))
    }
    touchLocked.current = "none"
    setPaused(false)
  }

  // Always show fallback while loading to prevent CLS when slides arrive
  if (slides.length === 0) {
    return <HeroFallback />
  }

  return (
    <section
      className="relative h-[50svh] md:h-[80svh] min-h-[340px] md:min-h-[520px] max-h-[480px] md:max-h-[800px] overflow-hidden pt-[104px] md:pt-14 lg:pt-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Only render active + adjacent slides to reduce DOM nodes */}
      {slides.map((book, i) => {
        const distance = Math.abs(i - current);
        const wrappedDistance = Math.min(distance, slides.length - distance);
        if (wrappedDistance > 1) return null;
        return <HeroSlide key={book.id} book={book} isActive={i === current} />;
      })}

      {/* Navigation arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => goTo(current - 1)}
            className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-10 md:h-10 rounded-full bg-card/80 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all"
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button
            onClick={() => goTo(current + 1)}
            className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-10 md:h-10 rounded-full bg-card/80 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all"
          >
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </>
      )}

      {/* Dots + progress bar */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`relative h-1.5 rounded-full transition-all duration-300 overflow-hidden ${
                i === current ? "w-8 bg-primary/30" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
            >
              {i === current && (
                <span
                  className="absolute inset-0 bg-primary rounded-full"
                  style={{
                    animation: paused ? "none" : `hero-progress ${SLIDE_INTERVAL}ms linear forwards`,
                  }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Bottom stats bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background to-transparent pt-6 md:pt-16 pb-8 md:pb-14">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-center gap-4 md:gap-12">
            {[
              { value: formatCount(stats.ebooks), label: "eBooks" },
              { value: formatCount(stats.audiobooks), label: "Audiobooks" },
              { value: formatCount(stats.hardcopies), label: "Hard Copies" },
              { value: formatCount(stats.narrators), label: "Narrators" },
            ].map((stat, i) => (
              <div key={stat.label} className="flex items-center gap-4 md:gap-8">
                {i > 0 && <div className="w-px h-4 md:h-6 bg-border/40 -ml-2 md:-ml-6" />}
                <div className="text-center">
                  <div className="text-sm md:text-lg font-serif font-bold text-foreground">{stat.value}</div>
                  <div className="text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Fallback if no books loaded yet */
function HeroFallback() {
  return (
    <section className="relative h-[50svh] md:h-[80svh] min-h-[340px] md:min-h-[520px] max-h-[480px] md:max-h-[800px] overflow-hidden pt-[104px] md:pt-14 lg:pt-14">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/30" />
      <div className="relative z-10 container mx-auto px-4 lg:px-8 h-full flex items-center">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 md:gap-8 lg:gap-16 w-full">
          <div className="flex-1 max-w-2xl space-y-3">
            <div className="h-5 w-24 bg-muted/30 rounded-full animate-pulse" />
            <div className="h-8 md:h-12 w-3/4 bg-muted/20 rounded-lg animate-pulse" />
            <div className="h-4 w-full max-w-xl bg-muted/15 rounded animate-pulse" />
            <div className="h-4 w-2/3 max-w-xl bg-muted/15 rounded animate-pulse" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 md:h-12 w-28 bg-muted/20 rounded-lg animate-pulse" />
              <div className="h-8 md:h-12 w-28 bg-muted/20 rounded-lg animate-pulse" />
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="w-[120px] sm:w-[160px] md:w-[200px] lg:w-[240px] xl:w-[280px] aspect-[2/3] rounded-xl lg:rounded-2xl bg-muted/15 animate-pulse" />
          </div>
        </div>
      </div>
      {/* Stats bar placeholder */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background to-transparent pt-6 md:pt-16 pb-8 md:pb-14">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-center gap-4 md:gap-12">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-4 md:gap-8">
                {i > 1 && <div className="w-px h-4 md:h-6 bg-border/40 -ml-2 md:-ml-6" />}
                <div className="text-center">
                  <div className="h-5 w-8 bg-muted/20 rounded animate-pulse mx-auto mb-1" />
                  <div className="h-2.5 w-12 bg-muted/15 rounded animate-pulse mx-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
