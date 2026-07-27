import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAdConfig } from "@/hooks/useAdConfig";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SLIDE_INTERVAL = 5000;

declare global {
  interface Window { adsbygoogle: unknown[]; }
}

interface Props {
  placementKey: string;
  device?: "mobile" | "desktop" | "all";
  /** Pass true when AdBannerBlock is already inside a container div — prevents double padding */
  noContainer?: boolean;
}

function AdSenseBanner({ publisherId, unitId }: { publisherId: string; unitId: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {}
  }, []);

  return (
    <div className="w-full min-h-[60px] overflow-hidden rounded-xl border border-border/20">
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%", minHeight: "60px" }}
        data-ad-client={publisherId}
        data-ad-slot={unitId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

interface BannerSlide {
  id?: string;
  image_url: string;
  destination_url?: string | null;
}

function SlideLink({ slide, title, onClick }: { slide: BannerSlide; title?: string | null; onClick: () => void }) {
  const isExternal = slide.destination_url?.startsWith("http");
  return (
    <a
      href={slide.destination_url || "#"}
      target={isExternal ? "_blank" : "_self"}
      rel="noopener noreferrer"
      draggable={false}
      className={`block w-full flex items-center justify-center bg-black/5 ${
        slide.destination_url ? "cursor-pointer" : "cursor-default pointer-events-none"
      }`}
      onClick={e => {
        if (!slide.destination_url) { e.preventDefault(); return; }
        onClick();
      }}
    >
      <img
        src={slide.image_url}
        alt={title || "বিজ্ঞাপন"}
        className="w-full h-auto max-h-[300px] object-contain block"
        loading="lazy"
        draggable={false}
      />
    </a>
  );
}

function BannerItem({ banner, onImpression, onClick }: {
  banner: { id: string; title?: string | null; image_url?: string | null; destination_url?: string | null; slides?: BannerSlide[] };
  onImpression: (bannerId: string, slideId?: string) => void;
  onClick: (bannerId: string, slideId?: string) => void;
}) {
  const slides: BannerSlide[] = banner.slides?.length
    ? banner.slides
    : banner.image_url
      ? [{ image_url: banner.image_url, destination_url: banner.destination_url }]
      : [];

  const ref = useRef<HTMLDivElement>(null);
  const logged = useRef(false);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (logged.current || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !logged.current) {
        logged.current = true;
        onImpression(banner.id, slides[current]?.id);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner.id]);

  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (paused || slides.length <= 1 || prefersReducedMotion) return;
    const timer = setInterval(() => setCurrent(c => (c + 1) % slides.length), SLIDE_INTERVAL);
    return () => clearInterval(timer);
  }, [paused, slides.length, prefersReducedMotion]);

  const goTo = useCallback((idx: number) => setCurrent((idx + slides.length) % slides.length), [slides.length]);

  if (slides.length === 0) {
    return banner.title ? (
      <div className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-primary/10 border-l-4 border-primary rounded-xl">
        <p className="text-sm font-semibold text-foreground leading-snug">{banner.title}</p>
      </div>
    ) : null;
  }

  return (
    <div
      ref={ref}
      className="relative w-full rounded-xl overflow-hidden border border-border/30 bg-card/40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(delta) > 40) goTo(current + (delta < 0 ? 1 : -1));
        touchStartX.current = null;
      }}
    >
      {slides.map((slide, i) => (
        <div key={slide.id ?? i} className={i === current ? "block" : "hidden"}>
          <SlideLink slide={slide} title={banner.title} onClick={() => onClick(banner.id, slide.id)} />
        </div>
      ))}

      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="আগের ছবি"
            onClick={() => goTo(current - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/70 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="পরের ছবি"
            onClick={() => goTo(current + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/70 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`স্লাইড ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AdBannerBlock({ placementKey, device = "all", noContainer = false }: Props) {
  const { user } = useAuth();
  const { config } = useAdConfig();
  const { data: allBanners = [], isLoading: bannersLoading } = trpc.books.activeAdBanners.useQuery();
  const { data: placements = [], isLoading: placementsLoading } = trpc.books.activePlacements.useQuery();
  const { data: subscriptionStatus } = trpc.wallet.hasSubscription.useQuery({}, { enabled: !!user });
  const recordImpression = trpc.books.recordAdImpression.useMutation();
  const recordClick = trpc.books.recordAdClick.useMutation();

  // Stay hidden while loading to avoid layout shift
  if (bannersLoading || placementsLoading) return null;

  // Check if this placement is enabled and device-matched
  const placement = placements.find((p: any) => p.placement_key === placementKey);
  const placementEnabled = placements.length === 0 || !!placement;
  const placementDevice: string = placement?.device_visibility ?? "all";
  const deviceMatch = placementDevice === "all" || device === "all" || placementDevice === device;

  if (!placementEnabled || !deviceMatch) return null;

  // Hide for any active subscriber if setting is on. "Ad-free" applies to every
  // paid plan (Plus and Premium alike), never a specific plan name.
  if (config.systemEnabled && config.premiumHideAds && subscriptionStatus?.hasSub) return null;

  // Collect image banners for this placement
  const banners = (allBanners as any[]).filter((b: any) => b.placement_key === placementKey);

  const showAdsense = config.systemEnabled && config.providerType === "adsense" &&
    !!config.adsensePublisherId && !!config.webBannerUnitId;

  const wrapClass = noContainer
    ? "py-2 space-y-2"
    : "container mx-auto px-4 lg:px-8 py-2 space-y-2";

  // Nothing to show — hide the section entirely
  if (banners.length === 0 && !showAdsense) return null;

  return (
    <div className={wrapClass}>
      {banners.map((banner: any) => (
        <BannerItem
          key={banner.id}
          banner={banner}
          onImpression={(bannerId, slideId) => user && recordImpression.mutate({ bannerId, slideId })}
          onClick={(bannerId, slideId) => user && recordClick.mutate({ bannerId, slideId })}
        />
      ))}

      {showAdsense && banners.length === 0 && (
        <AdSenseBanner publisherId={config.adsensePublisherId} unitId={config.webBannerUnitId} />
      )}
    </div>
  );
}
