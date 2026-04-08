import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/integrations/supabase/client"
import type { User, Session } from "@supabase/supabase-js"
import { setSentryUser } from "@/lib/sentry"

interface Profile {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  preferred_language: string | null
  is_active: boolean
  [key: string]: any
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url, bio, preferred_language, is_active, full_name, genre, specialty, experience, referral_code, referred_by, website_url, facebook_url, instagram_url, youtube_url, portfolio_url, created_at, updated_at")
      .eq("user_id", userId)
      .single()
    setProfile(data)
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    })
    return { error: error as Error | null }
  }

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data?.user) {
      // Check if user is active or soft-deleted
      const { data: profileData } = await supabase
        .from("profiles")
        .select("is_active, deleted_at")
        .eq("user_id", data.user.id)
        .single()

      if (profileData && (profileData as any).deleted_at) {
        await supabase.auth.signOut()
        return { error: new Error("This account has been deleted. Please contact support to restore it.") as Error }
      }

      if (profileData && (profileData as any).is_active === false) {
        await supabase.auth.signOut()
        return { error: new Error("Your account has been deactivated. Please contact support.") as Error }
      }

      // Process pending referral
      const pendingRef = localStorage.getItem("pending_referral_code")
      if (pendingRef) {
        localStorage.removeItem("pending_referral_code")
        supabase.functions.invoke("process-referral", {
          body: { action: "complete_referral", referral_code: pendingRef, source: "signup" },
        }).catch(() => {})
      }
    }
    return { error: error as Error | null }
  }

  // Sync Sentry user context
  useEffect(() => {
    if (user) {
      setSentryUser({ id: user.id, email: user.email });
    } else {
      setSentryUser(null);
    }
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut()
    setSentryUser(null)
    setProfile(null)
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return
    await supabase.from("profiles").update(updates).eq("user_id", user.id)
    await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
