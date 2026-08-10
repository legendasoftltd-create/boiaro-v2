import { trpc } from "@/lib/trpc";

export interface RadioStation {
  id: string;
  name: string;
  stream_url: string;
  stream_url_medium?: string | null;
  stream_url_low?: string | null;
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

// All active stations, not just the single default one — several can be
// live independently at once (see studio-bridge's per-station Icecast
// mounts), so anywhere that needs to show every station (not just "the"
// homepage default) should use this instead of useRadioStation.
export function useRadioStations() {
  const query = trpc.rj.radioStations.useQuery(undefined, {
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  return {
    data: (query.data ?? []) as RadioStation[],
    isLoading: query.isLoading,
    error: query.error,
  };
}
