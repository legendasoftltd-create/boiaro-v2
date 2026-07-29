import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { prisma } from "./prisma.js";

export interface GaRealtimeReport {
  configured: boolean;
  error?: string;
  activeUsers?: number;
  topPages?: { path: string; activeUsers: number }[];
  topCountries?: { country: string; activeUsers: number }[];
}

const CACHE_TTL_MS = 15_000;
let cache: { data: GaRealtimeReport; expiresAt: number } | null = null;

async function fetchReport(): Promise<GaRealtimeReport> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: ["analytics_ga4_property_id", "analytics_ga4_service_account_json"] } },
  });
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.key] = r.value; });

  const propertyId = (map.analytics_ga4_property_id || "").trim();
  const credentialsJson = (map.analytics_ga4_service_account_json || "").trim();

  if (!propertyId || !credentialsJson) {
    return { configured: false };
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    return { configured: false, error: "Service account JSON is not valid JSON — re-paste the full key file contents." };
  }

  try {
    const client = new BetaAnalyticsDataClient({ credentials: credentials as never });

    const [response] = await client.runRealtimeReport({
      property: `properties/${propertyId}`,
      dimensions: [{ name: "unifiedScreenName" }, { name: "country" }],
      metrics: [{ name: "activeUsers" }],
      limit: 500,
    });

    const pageMap = new Map<string, number>();
    const countryMap = new Map<string, number>();
    let totalActiveUsers = 0;

    for (const row of response.rows ?? []) {
      const page = row.dimensionValues?.[0]?.value || "(not set)";
      const country = row.dimensionValues?.[1]?.value || "(not set)";
      const users = Number(row.metricValues?.[0]?.value || 0);
      pageMap.set(page, (pageMap.get(page) || 0) + users);
      countryMap.set(country, (countryMap.get(country) || 0) + users);
      totalActiveUsers += users;
    }

    const topPages = [...pageMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([path, activeUsers]) => ({ path, activeUsers }));

    const topCountries = [...countryMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([country, activeUsers]) => ({ country, activeUsers }));

    return { configured: true, activeUsers: totalActiveUsers, topPages, topCountries };
  } catch (err) {
    const message = (err as Error)?.message || "Unknown error calling the GA4 Data API";
    return { configured: true, error: message };
  }
}

/** GA4 Realtime API has tight quotas, so this is cached briefly and shared across all admins polling the panel. */
export async function getGaRealtimeReport(): Promise<GaRealtimeReport> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  const data = await fetchReport();
  cache = { data, expiresAt: now + CACHE_TTL_MS };
  return data;
}
