import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdConfig {
  systemEnabled: boolean;
  providerType: string;
  adsensePublisherId: string;
  admobAppIdAndroid: string;
  admobAppIdIos: string;
  webBannerUnitId: string;
  appBannerUnitId: string;
  interstitialUnitId: string;
  rewardedUnitId: string;
  appOpenUnitId: string;
  premiumHideAds: boolean;
  freeShowAds: boolean;
  countryTargeting: string[];
  rewardedCoins: number;
  maxPerDay: number;
  cooldownMinutes: number;
}

export function useAdConfig() {
  const { data, isLoading } = useQuery({
    queryKey: ["ad-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .like("key", "ad_%");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((d) => { map[d.key] = d.value; });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const get = (key: string, fallback = "") => data?.[key] ?? fallback;

  const config: AdConfig = {
    systemEnabled: get("ad_system_enabled") === "true",
    providerType: get("ad_provider_type", "adsense"),
    adsensePublisherId: get("ad_adsense_publisher_id"),
    admobAppIdAndroid: get("ad_admob_app_id_android"),
    admobAppIdIos: get("ad_admob_app_id_ios"),
    webBannerUnitId: get("ad_web_banner_unit_id"),
    appBannerUnitId: get("ad_app_banner_unit_id"),
    interstitialUnitId: get("ad_interstitial_unit_id"),
    rewardedUnitId: get("ad_rewarded_unit_id"),
    appOpenUnitId: get("ad_app_open_unit_id"),
    premiumHideAds: get("ad_premium_hide_ads", "true") === "true",
    freeShowAds: get("ad_free_show_ads", "true") === "true",
    countryTargeting: get("ad_country_targeting")
      ? get("ad_country_targeting").split(",").map(s => s.trim()).filter(Boolean)
      : [],
    rewardedCoins: parseInt(get("ad_rewarded_coins", "5"), 10),
    maxPerDay: parseInt(get("ad_max_per_day", "10"), 10),
    cooldownMinutes: parseInt(get("ad_cooldown_minutes", "5"), 10),
  };

  return { config, isLoading };
}
