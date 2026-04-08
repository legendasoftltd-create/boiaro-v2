import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"

export interface RadioStation {
  id: string
  name: string
  stream_url: string
  artwork_url: string | null
  description: string | null
  is_active: boolean
  sort_order: number
}

export function useRadioStation() {
  const queryClient = useQueryClient()

  // Subscribe to realtime changes on radio_stations so toggle takes effect immediately
  useEffect(() => {
    const channel = supabase
      .channel("radio-station-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "radio_stations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["radio-station"] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return useQuery({
    queryKey: ["radio-station"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radio_stations")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (error || !data) return null
      return data as RadioStation
    },
    staleTime: 30 * 1000, // 30s — keeps UI responsive to admin toggle changes
  })
}
