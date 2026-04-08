import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HomepageSection {
  id: string;
  section_key: string;
  title: string;
  subtitle: string | null;
  is_enabled: boolean;
  sort_order: number;
  display_source: string | null;
}

export function useHomepageSections() {
  return useQuery({
    queryKey: ["homepage-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as HomepageSection[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
