import { trpc } from "@/lib/trpc";

export interface SiteSetting {
  id: string;
  key: string;
  value: string;
}

export function useSiteSettings() {
  const { data, isLoading, refetch } = trpc.books.siteSettings.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const settings = data || [];

  const get = (key: string, fallback = "") => {
    const s = settings.find((s) => s.key === key);
    return s?.value || fallback;
  };

  const isOn = (key: string) => get(key) === "true";

  return { settings, get, isOn, isLoading, refetch };
}
