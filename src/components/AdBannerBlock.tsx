import { trpc } from "@/lib/trpc"

interface Props {
  placementKey: string
}

export function AdBannerBlock({ placementKey }: Props) {
  const { data: allBanners = [] } = trpc.books.activeAdBanners.useQuery()
  const banners = allBanners.filter(b => b.placement_key === placementKey)

  if (banners.length === 0) return null

  return (
    <div className="container mx-auto px-4 lg:px-8 py-3 space-y-3">
      {banners.map(banner => (
        <a
          key={banner.id}
          href={banner.destination_url || "#"}
          target={banner.destination_url?.startsWith("http") ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className={`block rounded-xl overflow-hidden border border-border/30 ${banner.destination_url ? "cursor-pointer hover:opacity-95 transition-opacity" : "cursor-default"}`}
          onClick={e => { if (!banner.destination_url) e.preventDefault() }}
        >
          {banner.image_url ? (
            <img
              src={banner.image_url}
              alt={banner.title || ""}
              className="w-full object-cover max-h-[120px] md:max-h-[160px]"
              loading="lazy"
            />
          ) : (
            banner.title && (
              <div className="w-full px-6 py-4 bg-primary/10 border-l-4 border-primary">
                <p className="text-sm font-semibold text-foreground">{banner.title}</p>
              </div>
            )
          )}
        </a>
      ))}
    </div>
  )
}
