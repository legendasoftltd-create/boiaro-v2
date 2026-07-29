import { trpc } from "@/lib/trpc";

export interface AnalyticsConfig {
  ga4Enabled: boolean;
  ga4MeasurementId: string;
  gtmEnabled: boolean;
  gtmContainerId: string;
}

export function useAnalyticsConfig() {
  // Uses the public books.analyticsSettings endpoint — accessible to all users, not admin-only
  const query = trpc.books.analyticsSettings.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const map = (query.data as Record<string, string>) ?? {};
  const get = (key: string, fallback = "") => map[key] ?? fallback;

  const config: AnalyticsConfig = {
    ga4Enabled: get("analytics_ga4_enabled", "false") === "true",
    ga4MeasurementId: get("analytics_ga4_measurement_id"),
    gtmEnabled: get("analytics_gtm_enabled", "false") === "true",
    gtmContainerId: get("analytics_gtm_container_id"),
  };

  return { config, isLoading: query.isLoading };
}
