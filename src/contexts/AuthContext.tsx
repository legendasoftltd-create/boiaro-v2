import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { trpc } from "@/lib/trpc"
import { setSentryUser } from "@/lib/sentry"
import { useQueryClient } from "@tanstack/react-query"

export interface AuthUser {
  id: string
  email: string
  roles?: string[]
}

interface Profile {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  preferred_language: string | null
  is_active: boolean
  referral_code: string | null
  [key: string]: any
}

interface AuthContextType {
  user: AuthUser | null
  session: null
  profile: Profile | null
  loading: boolean
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithGoogle: (accessToken: string) => Promise<{ error: Error | null }>
  signInWithFacebook: (accessToken: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function parseUserFromToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return { id: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()
  const utils = trpc.useUtils()

  const signInMutation = trpc.auth.signIn.useMutation()
  const signInWithGoogleMutation = trpc.auth.signInWithGoogle.useMutation()
  const signInWithFacebookMutation = trpc.auth.signInWithFacebook.useMutation()
  const signUpMutation = trpc.auth.signUp.useMutation()
  const updateProfileMutation = trpc.auth.updateProfile.useMutation()

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("access_token")
    if (!token) { setLoading(false); return }
    const parsed = parseUserFromToken(token)
    if (!parsed) { setLoading(false); return }
    setUser(parsed)
    try {
      const me = await utils.auth.me.fetch()
      setUser({ id: me.id, email: me.email, roles: me.roles })
      setProfile(me.profile as Profile)
      setSentryUser({ id: me.id, email: me.email })
    } catch {
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [utils])

  useEffect(() => { loadUser() }, [loadUser])

  const signIn = async (email: string, password: string) => {
    try {
      const result = await signInMutation.mutateAsync({ email, password })
      localStorage.setItem("access_token", result.accessToken)
      localStorage.setItem("refresh_token", result.refreshToken)
      const u = { id: result.user.id, email: result.user.email, roles: result.user.roles }
      setUser(u)
      setProfile(result.user.profile as Profile)
      setSentryUser({ id: u.id, email: u.email })

      const pendingRef = localStorage.getItem("pending_referral_code")
      if (pendingRef) localStorage.removeItem("pending_referral_code")

      return { error: null }
    } catch (err: any) {
      return { error: new Error(err?.message || "Login failed") }
    }
  }

  const signInWithGoogle = async (accessToken: string) => {
    try {
      const result = await signInWithGoogleMutation.mutateAsync({ accessToken })
      localStorage.setItem("access_token", result.accessToken)
      localStorage.setItem("refresh_token", result.refreshToken)
      const u = { id: result.user.id, email: result.user.email, roles: result.user.roles }
      setUser(u)
      setProfile(result.user.profile as Profile)
      setSentryUser({ id: u.id, email: u.email })
      return { error: null }
    } catch (err: any) {
      return { error: new Error(err?.message || "Google login failed") }
    }
  }

  const signInWithFacebook = async (accessToken: string) => {
    try {
      const result = await signInWithFacebookMutation.mutateAsync({ accessToken })
      localStorage.setItem("access_token", result.accessToken)
      localStorage.setItem("refresh_token", result.refreshToken)
      const u = { id: result.user.id, email: result.user.email, roles: result.user.roles }
      setUser(u)
      setProfile(result.user.profile as Profile)
      setSentryUser({ id: u.id, email: u.email })
      return { error: null }
    } catch (err: any) {
      return { error: new Error(err?.message || "Facebook login failed") }
    }
  }

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      await signUpMutation.mutateAsync({ email, password, displayName })
      return { error: null }
    } catch (err: any) {
      return { error: new Error(err?.message || "Signup failed") }
    }
  }

  const signOut = async () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    setUser(null)
    setProfile(null)
    setSentryUser(null)
    queryClient.clear()
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return
    await updateProfileMutation.mutateAsync(updates as any)
    setProfile(prev => prev ? { ...prev, ...updates } : null)
  }

  return (
    <AuthContext.Provider value={{ user, session: null, profile, loading, signIn, signInWithGoogle, signInWithFacebook, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
