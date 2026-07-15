import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { trpc } from "@/lib/trpc"
import { setSentryUser } from "@/lib/sentry"
import { useQueryClient } from "@tanstack/react-query"
import { getOrCreateDeviceId, getDeviceDisplayInfo } from "@/lib/deviceId"

export interface DeviceSessionSummary {
  id: string
  device_name: string | null
  platform: string | null
  last_active_at: string
}

export interface SignInResult {
  error: Error | null
  deviceLimitReached?: boolean
  devices?: DeviceSessionSummary[]
}

export interface AuthUser {
  id: string
  email: string
  roles?: string[]
}

export interface Profile {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  phone: string | null
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
  signIn: (email: string, password: string, revokeDeviceId?: string) => Promise<SignInResult>
  signInWithGoogle: (accessToken: string, revokeDeviceId?: string) => Promise<SignInResult>
  signInWithFacebook: (accessToken: string, revokeDeviceId?: string) => Promise<SignInResult>
  signInWithPhone: (phone: string, otp: string, revokeDeviceId?: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  setProfileAvatar: (url: string) => void
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
  const verifyPhoneOtpMutation = trpc.auth.verifyPhoneOtp.useMutation()
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

  // Reads the device-limit-reached payload off a tRPC error, if present.
  const deviceLimitFromError = (err: any): { deviceLimitReached: boolean; devices?: DeviceSessionSummary[] } => {
    const data = err?.data
    if (data?.appErrorCode === "DEVICE_LIMIT_REACHED") {
      return { deviceLimitReached: true, devices: data.devices }
    }
    return { deviceLimitReached: false }
  }

  const signIn = async (email: string, password: string, revokeDeviceId?: string): Promise<SignInResult> => {
    try {
      const deviceId = await getOrCreateDeviceId()
      const { deviceName, platform } = await getDeviceDisplayInfo()
      const result = await signInMutation.mutateAsync({ email, password, deviceId, deviceName, platform, revokeDeviceId })
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
      return { error: new Error(err?.message || "Login failed"), ...deviceLimitFromError(err) }
    }
  }

  const signInWithGoogle = async (accessToken: string, revokeDeviceId?: string): Promise<SignInResult> => {
    try {
      const deviceId = await getOrCreateDeviceId()
      const { deviceName, platform } = await getDeviceDisplayInfo()
      const result = await signInWithGoogleMutation.mutateAsync({ accessToken, deviceId, deviceName, platform, revokeDeviceId })
      localStorage.setItem("access_token", result.accessToken)
      localStorage.setItem("refresh_token", result.refreshToken)
      const u = { id: result.user.id, email: result.user.email, roles: result.user.roles }
      setUser(u)
      setProfile(result.user.profile as Profile)
      setSentryUser({ id: u.id, email: u.email })
      return { error: null }
    } catch (err: any) {
      return { error: new Error(err?.message || "Google login failed"), ...deviceLimitFromError(err) }
    }
  }

  const signInWithFacebook = async (accessToken: string, revokeDeviceId?: string): Promise<SignInResult> => {
    try {
      const deviceId = await getOrCreateDeviceId()
      const { deviceName, platform } = await getDeviceDisplayInfo()
      const result = await signInWithFacebookMutation.mutateAsync({ accessToken, deviceId, deviceName, platform, revokeDeviceId })
      localStorage.setItem("access_token", result.accessToken)
      localStorage.setItem("refresh_token", result.refreshToken)
      const u = { id: result.user.id, email: result.user.email, roles: result.user.roles }
      setUser(u)
      setProfile(result.user.profile as Profile)
      setSentryUser({ id: u.id, email: u.email })
      return { error: null }
    } catch (err: any) {
      return { error: new Error(err?.message || "Facebook login failed"), ...deviceLimitFromError(err) }
    }
  }

  const signInWithPhone = async (phone: string, otp: string, revokeDeviceId?: string): Promise<SignInResult> => {
    try {
      const deviceId = await getOrCreateDeviceId()
      const { deviceName, platform } = await getDeviceDisplayInfo()
      const result = await verifyPhoneOtpMutation.mutateAsync({ phone, otp, deviceId, deviceName, platform, revokeDeviceId })
      localStorage.setItem("access_token", result.accessToken)
      localStorage.setItem("refresh_token", result.refreshToken)
      const u = { id: result.user.id, email: result.user.email, roles: result.user.roles }
      setUser(u)
      setProfile(result.user.profile as Profile)
      setSentryUser({ id: u.id, email: u.email })
      return { error: null }
    } catch (err: any) {
      return { error: new Error(err?.message || "Phone login failed"), ...deviceLimitFromError(err) }
    }
  }

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const referralCode = localStorage.getItem("pending_referral_code") || undefined
      await signUpMutation.mutateAsync({ email, password, displayName, referralCode })
      if (referralCode) localStorage.removeItem("pending_referral_code")
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

  const updateProfile = async (updates: Partial<Profile> & { email?: string }) => {
    if (!user) return
    await updateProfileMutation.mutateAsync(updates as any)
    const { email, ...profileUpdates } = updates
    setProfile(prev => prev ? { ...prev, ...profileUpdates } : null)
    if (email) {
      setUser(prev => prev ? { ...prev, email } : null)
    }
  }

  const setProfileAvatar = (url: string) => {
    setProfile(prev => prev ? { ...prev, avatar_url: url } : null)
  }

  return (
    <AuthContext.Provider value={{ user, session: null, profile, loading, signIn, signInWithGoogle, signInWithFacebook, signInWithPhone, signUp, signOut, updateProfile, setProfileAvatar }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
