import { trpc } from "@/lib/trpc";

export interface RadioStation {
  id: string;
  name: string;
  stream_url: string;
  artwork_url: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export function useRadioStation() {
  const query = trpc.rj.radioStation.useQuery(undefined, {
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  return {
    data: query.data as RadioStation | null | undefined,
    isLoading: query.isLoading,
    error: query.error,
  };
}
