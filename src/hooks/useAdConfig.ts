import { trpc } from "@/lib/trpc";

export interface AdConfig {
  systemEnabled: boolean;
  providerType: string;
  adsensePublisherId: string;
  webBannerUnitId: string;
  rewardedUnitId: string;
  premiumHideAds: boolean;
  freeShowAds: boolean;
  countryTargeting: string[];
  rewardedCoins: number;
  maxPerDay: number;
  cooldownMinutes: number;
}

export function useAdConfig() {
  // Uses the public books.adSettings endpoint — accessible to all users, not admin-only
  const query = trpc.books.adSettings.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const map = (query.data as Record<string, string>) ?? {};
  const get = (key: string, fallback = "") => map[key] ?? fallback;

  const config: AdConfig = {
    systemEnabled: get("ad_system_enabled", "false") === "true",
    providerType: get("ad_provider_type", "none"),
    adsensePublisherId: get("ad_adsense_publisher_id"),
    webBannerUnitId: get("ad_web_banner_unit_id"),
    rewardedUnitId: get("ad_rewarded_unit_id"),
    premiumHideAds: get("ad_premium_hide_ads", "true") === "true",
    freeShowAds: get("ad_free_show_ads", "true") === "true",
    countryTargeting: get("ad_country_targeting")
      ? get("ad_country_targeting").split(",").map(s => s.trim()).filter(Boolean)
      : [],
    rewardedCoins: parseInt(get("ad_rewarded_coins", "1"), 10),
    maxPerDay: parseInt(get("ad_max_per_day", "10"), 10),
    cooldownMinutes: parseInt(get("ad_cooldown_minutes", "5"), 10),
  };

  return { config, isLoading: query.isLoading };
}
