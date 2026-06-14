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
}

function AdSenseBanner({ publisherId, unitId }: { publisherId: string; unitId: string }) {
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} className="overflow-hidden">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
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

  return (
    <a
      ref={ref}
      href={banner.destination_url || "#"}
      target={banner.destination_url?.startsWith("http") ? "_blank" : "_self"}
      rel="noopener noreferrer"
      className={`block rounded-xl overflow-hidden border border-border/30 ${
        banner.destination_url ? "cursor-pointer hover:opacity-95 transition-opacity" : "cursor-default"
      }`}
      onClick={e => {
        if (!banner.destination_url) { e.preventDefault(); return; }
        onClick(banner.id);
      }}
    >
      {banner.image_url ? (
        <img
          src={banner.image_url}
          alt={banner.title || ""}
          className="w-full object-cover max-h-[120px] md:max-h-[160px]"
          loading="lazy"
        />
      ) : banner.title ? (
        <div className="w-full px-6 py-4 bg-primary/10 border-l-4 border-primary">
          <p className="text-sm font-semibold text-foreground">{banner.title}</p>
        </div>
      ) : null}
    </a>
  );
}

export function AdBannerBlock({ placementKey, device = "all" }: Props) {
  const { user } = useAuth();
  const { config } = useAdConfig();
  const { data: allBanners = [] } = trpc.books.activeAdBanners.useQuery();
  const { data: placements = [] } = trpc.books.activePlacements.useQuery();
  const recordImpression = trpc.books.recordAdImpression.useMutation();
  const recordClick = trpc.books.recordAdClick.useMutation();

  // Check if this placement is enabled and matches the device
  const placement = placements.find((p: any) => p.placement_key === placementKey);
  const placementEnabled = placements.length === 0 || !!placement; // show if no placements defined yet
  const placementDevice: string = placement?.device_visibility ?? "all";
  const deviceMatch = placementDevice === "all" || device === "all" || placementDevice === device;

  if (!placementEnabled || !deviceMatch) return null;

  // Respect premium/free settings
  if (config.systemEnabled && config.premiumHideAds && (user as any)?.subscription_status === "premium") return null;

  // Collect image banners for this placement
  const banners = (allBanners as any[]).filter((b: any) => b.placement_key === placementKey);

  // Decide what to render
  const showAdsense = config.systemEnabled && config.providerType === "adsense" &&
    config.adsensePublisherId && config.webBannerUnitId;

  if (banners.length === 0 && !showAdsense) {
    // Show a slot indicator when the ad system is enabled but no content is configured yet
    if (!config.systemEnabled) return null;
    return (
      <div className="container mx-auto px-4 lg:px-8 py-2">
        <div className="w-full rounded-lg border border-dashed border-border/30 bg-muted/20 flex items-center justify-center py-3 min-h-[56px]">
          <p className="text-[11px] text-muted-foreground/40 select-none">[ বিজ্ঞাপন · {placementKey} ]</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 lg:px-8 py-3 space-y-3">
      {/* Image banners from DB */}
      {banners.map((banner: any) => (
        <BannerItem
          key={banner.id}
          banner={banner}
          onImpression={id => user && recordImpression.mutate({ bannerId: id })}
          onClick={id => user && recordClick.mutate({ bannerId: id })}
        />
      ))}

      {/* AdSense display banner when no image banners and provider is configured */}
      {showAdsense && banners.length === 0 && (
        <AdSenseBanner publisherId={config.adsensePublisherId} unitId={config.webBannerUnitId} />
      )}
    </div>
  );
}
