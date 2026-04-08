import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SiteSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: string;
  category: string;
  label: string;
  sort_order: number;
  is_enabled: boolean;
}

export function useSiteSettings() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as SiteSetting[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const settings = data || [];

  const get = (key: string, fallback = "") => {
    const s = settings.find((s) => s.setting_key === key);
    return s?.setting_value || fallback;
  };

  const isOn = (key: string) => get(key) === "true";

  const byCategory = (cat: string) =>
    settings.filter((s) => s.category === cat).sort((a, b) => a.sort_order - b.sort_order);

  return { settings, get, isOn, byCategory, isLoading, refetch };
}
