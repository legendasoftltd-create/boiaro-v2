import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { trpc } from "@/lib/trpc"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const SLIDE_INTERVAL = 5000

export function HeroBannerStrip() {
  const { data: banners = [] } = trpc.books.heroBanners.useQuery()
  const navigate = useNavigate()
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback(
    (idx: number) => setCurrent((idx + banners.length) % banners.length),
    [banners.length]
  )

  useEffect(() => {
    if (paused || banners.length <= 1) return
    timerRef.current = setInterval(() => setCurrent(c => (c + 1) % banners.length), SLIDE_INTERVAL)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [paused, banners.length])

  if (banners.length === 0) return null

  const banner = banners[current]

  const handleCta = () => {
    if (!banner.cta_link) return
    if (banner.cta_link.startsWith("http")) {
      window.open(banner.cta_link, "_blank", "noopener")
    } else {
      navigate(banner.cta_link)
    }
  }

  return (
    <div
      className="relative w-full overflow-hidden bg-secondary/40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides */}
      <div className="relative">
        {banners.map((b, i) => (
          <div
            key={b.id}
            className={`transition-opacity duration-500 ${i === current ? "block opacity-100" : "hidden opacity-0"}`}
          >
            {b.image_url ? (
              <div className="relative w-full" style={{ maxHeight: 320 }}>
                <img
                  src={b.image_url}
                  alt={b.title}
                  className="w-full object-cover"
                  style={{ maxHeight: 320 }}
                  loading="lazy"
                />
                {/* overlay with text + CTA */}
                {(b.title || b.cta_text) && (
                  <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/40 to-transparent flex items-center px-6 md:px-12">
                    <div className="max-w-lg space-y-2">
                      {b.title && (
                        <h2 className="text-lg md:text-2xl font-serif font-bold text-foreground leading-tight">
                          {b.title}
                        </h2>
                      )}
                      {b.subtitle && (
                        <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{b.subtitle}</p>
                      )}
                      {b.cta_text && b.cta_link && (
                        <Button size="sm" className="btn-gold mt-1" onClick={handleCta}>
                          {b.cta_text}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Text-only banner */
              <div className="w-full px-6 md:px-12 py-8 md:py-10 flex items-center justify-between gap-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
                <div className="space-y-1.5 flex-1">
                  <h2 className="text-base md:text-xl font-serif font-bold text-foreground">{b.title}</h2>
                  {b.subtitle && <p className="text-xs md:text-sm text-muted-foreground">{b.subtitle}</p>}
                </div>
                {b.cta_text && b.cta_link && (
                  <Button size="sm" className="btn-gold shrink-0" onClick={handleCta}>
                    {b.cta_text}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Prev / Next arrows — only when multiple banners */}
      {banners.length > 1 && (
        <>
          <button
            onClick={() => goTo(current - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/70 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goTo(current + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/70 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
