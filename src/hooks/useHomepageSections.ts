import { trpc } from "@/lib/trpc";

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
  return trpc.books.homepageSections.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
}
