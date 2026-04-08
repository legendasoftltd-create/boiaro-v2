import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"

export interface LiveSession {
  id: string
  rj_user_id: string
  station_id: string | null
  stream_url: string | null
  show_title: string | null
  status: string
  started_at: string
  ended_at: string | null
  disconnect_reason: string | null
}

export interface RjProfile {
  id: string
  user_id: string
  stage_name: string
  bio: string | null
  avatar_url: string | null
  specialty: string | null
  is_approved: boolean
  is_active: boolean
}

export function useRjProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<RjProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return }
    supabase
      .from("rj_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data as RjProfile | null)
        setLoading(false)
      })
  }, [user])

  return { profile, loading }
}

export function useCurrentLiveSession() {
  const [session, setSession] = useState<(LiveSession & { rj_profile?: RjProfile }) | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchLive = async () => {
    const { data } = await supabase
      .from("live_sessions")
      .select("*")
      .eq("status", "live")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      const { data: rjData } = await supabase
        .from("rj_profiles")
        .select("*")
        .eq("user_id", (data as any).rj_user_id)
        .maybeSingle()
      
      setSession({ ...(data as LiveSession), rj_profile: rjData as RjProfile | undefined })
    } else {
      setSession(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchLive()

    // Subscribe to realtime changes
    const channel = supabase
      .channel("live-sessions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_sessions" },
        () => fetchLive()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { session, loading, refetch: fetchLive }
}

export function useMyLiveSession() {
  const { user } = useAuth()
  const [session, setSession] = useState<LiveSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setSession(null); setLoading(false); return }

    supabase
      .from("live_sessions")
      .select("*")
      .eq("rj_user_id", user.id)
      .eq("status", "live")
      .maybeSingle()
      .then(({ data }) => {
        setSession(data as LiveSession | null)
        setLoading(false)
      })
  }, [user])

  const goLive = async (streamUrl: string, showTitle?: string) => {
    if (!user) throw new Error("Not authenticated")

    // Check if anyone else is already live
    const { data: existing } = await supabase
      .from("live_sessions")
      .select("id, rj_user_id")
      .eq("status", "live")
      .limit(1)
      .maybeSingle()

    if (existing && (existing as any).rj_user_id !== user.id) {
      throw new Error("Another RJ is currently live. Please wait or contact admin.")
    }

    // Get station
    const { data: station } = await supabase
      .from("radio_stations")
      .select("id")
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from("live_sessions")
      .insert({
        rj_user_id: user.id,
        stream_url: streamUrl,
        show_title: showTitle || null,
        station_id: station?.id || null,
        status: "live",
      })
      .select()
      .single()

    if (error) throw error

    // Update stream URL only. Visibility is controlled by admin toggle.
    if (station) {
      await supabase
        .from("radio_stations")
        .update({ stream_url: streamUrl, updated_at: new Date().toISOString() })
        .eq("id", station.id)
    }

    setSession(data as LiveSession)
    return data
  }

  const endLive = async (reason?: string) => {
    if (!session) return

    // End the live session
    await supabase
      .from("live_sessions")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        disconnect_reason: reason || null,
      })
      .eq("id", session.id)

    // Keep station visibility unchanged here (admin toggle is the single source of truth).

    setSession(null)
  }

  return { session, loading, goLive, endLive }
}
