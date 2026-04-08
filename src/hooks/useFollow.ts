import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"

interface UseFollowOptions {
  profileId: string
  profileType: "author" | "narrator" | "publisher"
}

export function useFollow({ profileId, profileType }: UseFollowOptions) {
  const { user } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const loadState = useCallback(async () => {
    if (!profileId) return

    // Get follower count (public)
    const { count } = await supabase
      .from("follows" as any)
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("profile_type", profileType)

    setFollowersCount(count || 0)

    // Check if current user follows
    if (user) {
      const { data } = await supabase
        .from("follows" as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("profile_id", profileId)
        .eq("profile_type", profileType)
        .maybeSingle()

      setIsFollowing(!!data)
    }

    setLoading(false)
  }, [profileId, profileType, user])

  useEffect(() => {
    loadState()
  }, [loadState])

  const toggle = useCallback(async (): Promise<boolean> => {
    if (!user) return false
    if (toggling) return false
    setToggling(true)

    if (isFollowing) {
      // Optimistic unfollow
      setIsFollowing(false)
      setFollowersCount(c => Math.max(0, c - 1))

      const { error } = await supabase
        .from("follows" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("profile_id", profileId)
        .eq("profile_type", profileType)

      if (error) {
        // Revert
        setIsFollowing(true)
        setFollowersCount(c => c + 1)
        setToggling(false)
        return false
      }
    } else {
      // Optimistic follow
      setIsFollowing(true)
      setFollowersCount(c => c + 1)

      const { error } = await supabase
        .from("follows" as any)
        .insert({ user_id: user.id, profile_id: profileId, profile_type: profileType })

      if (error) {
        // Revert
        setIsFollowing(false)
        setFollowersCount(c => Math.max(0, c - 1))
        setToggling(false)
        return false
      }
    }

    setToggling(false)
    return true
  }, [user, isFollowing, toggling, profileId, profileType])

  return { isFollowing, followersCount, loading, toggling, toggle }
}
