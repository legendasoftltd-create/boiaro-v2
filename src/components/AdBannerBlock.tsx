import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAdConfig } from "@/hooks/useAdConfig";
import { useAuth } from "@/contexts/AuthContext";

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

function BannerItem({ banner, onImpression, onClick }: {
  banner: { id: string; title?: string | null; image_url?: string | null; destination_url?: string | null };
  onImpression: (id: string) => void;
  onClick: (id: string) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !logged.current) {
        logged.current = true;
        onImpression(banner.id);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [banner.id]);

  const isExternal = banner.destination_url?.startsWith("http");

  return (
    <a
      ref={ref}
      href={banner.destination_url || "#"}
      target={isExternal ? "_blank" : "_self"}
      rel="noopener noreferrer"
      className={`block w-full rounded-xl overflow-hidden border border-border/30 bg-card/40 ${
        banner.destination_url ? "cursor-pointer hover:opacity-90 active:opacity-80 transition-opacity" : "cursor-default pointer-events-none"
      }`}
      onClick={e => {
        if (!banner.destination_url) { e.preventDefault(); return; }
        onClick(banner.id);
      }}
    >
      {banner.image_url ? (
        /* Use a flex container so the image never gets cropped — height is natural */
        <div className="w-full flex items-center justify-center bg-black/5">
          <img
            src={banner.image_url}
            alt={banner.title || "বিজ্ঞাপন"}
            className="w-full h-auto max-h-[300px] object-contain block"
            loading="lazy"
            draggable={false}
          />
        </div>
      ) : banner.title ? (
        <div className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-primary/10 border-l-4 border-primary">
          <p className="text-sm font-semibold text-foreground leading-snug">{banner.title}</p>
        </div>
      ) : null}
    </a>
  );
}

export function AdBannerBlock({ placementKey, device = "all", noContainer = false }: Props) {
  const { user } = useAuth();
  const { config } = useAdConfig();
  const { data: allBanners = [] } = trpc.books.activeAdBanners.useQuery();
  const { data: placements = [] } = trpc.books.activePlacements.useQuery();
  const recordImpression = trpc.books.recordAdImpression.useMutation();
  const recordClick = trpc.books.recordAdClick.useMutation();

  // Check if this placement is enabled and device-matched
  const placement = placements.find((p: any) => p.placement_key === placementKey);
  const placementEnabled = placements.length === 0 || !!placement;
  const placementDevice: string = placement?.device_visibility ?? "all";
  const deviceMatch = placementDevice === "all" || device === "all" || placementDevice === device;

  if (!placementEnabled || !deviceMatch) return null;

  // Hide for premium users if setting is on
  if (config.systemEnabled && config.premiumHideAds && (user as any)?.subscription_status === "premium") return null;

  // Collect image banners for this placement
  const banners = (allBanners as any[]).filter((b: any) => b.placement_key === placementKey);

  const showAdsense = config.systemEnabled && config.providerType === "adsense" &&
    !!config.adsensePublisherId && !!config.webBannerUnitId;

  const wrapClass = noContainer
    ? "py-2 space-y-2"
    : "container mx-auto px-4 lg:px-8 py-2 space-y-2";

  // Nothing to show — render labeled slot when system is enabled so admin can see placement
  if (banners.length === 0 && !showAdsense) {
    if (!config.systemEnabled) return null;
    return (
      <div className={noContainer ? "py-2" : "container mx-auto px-4 lg:px-8 py-2"}>
        <div className="w-full rounded-lg border border-dashed border-border/30 bg-muted/10 flex items-center justify-center py-3 min-h-[52px]">
          <p className="text-[11px] text-muted-foreground/40 select-none font-mono">
            [ বিজ্ঞাপন · {placementKey} ]
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {banners.map((banner: any) => (
        <BannerItem
          key={banner.id}
          banner={banner}
          onImpression={id => user && recordImpression.mutate({ bannerId: id })}
          onClick={id => user && recordClick.mutate({ bannerId: id })}
        />
      ))}

      {showAdsense && banners.length === 0 && (
        <AdSenseBanner publisherId={config.adsensePublisherId} unitId={config.webBannerUnitId} />
      )}
    </div>
  );
}
