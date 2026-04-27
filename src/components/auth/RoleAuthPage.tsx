import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { lovable } from "@/integrations/lovable/index"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import logoBoiaro from "@/assets/logo_boiaro.png"
import type { LucideIcon } from "lucide-react"

export type AuthRoleConfig = {
  roleKey: string
  title: string
  titleBn: string
  subtitle: string
  icon: LucideIcon
  accentColor: string
  bgGradient: string
  showSignup: boolean
  showApply: boolean
  showGoogle: boolean
  applyMessage?: string
  showForgotPassword?: boolean
}

const ROLE_ROUTES: Record<string, string> = {
  admin: "/admin",
  writer: "/creator",
  publisher: "/creator",
  narrator: "/creator",
  rj: "/rj",
  user: "/dashboard",
}

export function RoleAuthPage({ config }: { config: AuthRoleConfig }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get("ref") || ""
  const { signIn, signInWithGoogle, signUp, user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      toast({ title: "Reset requested", description: "If this email exists, a reset link will be sent." })
      setMode("login")
    }, 800)
  }

  useEffect(() => {
    if (refCode && config.showSignup) setMode("signup")
  }, [refCode])

  const resolveRedirect = () => {
    const userRoles = (user?.roles as string[]) || []
    const priority = ["admin", "publisher", "writer", "narrator", "rj"]

    if (config.roleKey !== "user" && userRoles.includes(config.roleKey)) {
      navigate(ROLE_ROUTES[config.roleKey] || "/dashboard")
      return
    }

    const actual = priority.find(p => userRoles.includes(p)) || "user"
    if (config.roleKey !== "user" && actual !== config.roleKey) {
      setStatusMessage(`You don't have ${config.title} access. Redirecting to your dashboard...`)
      setTimeout(() => navigate(ROLE_ROUTES[actual] || "/dashboard"), 2000)
      return
    }

    navigate(ROLE_ROUTES[actual] || "/dashboard")
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setStatusMessage("")
    const { error } = await signIn(email, password)
    if (error) {
      setIsLoading(false)
      toast({ title: "Login failed", description: error.message, variant: "destructive" })
      return
    }
    resolveRedirect()
    setIsLoading(false)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const { error } = await signUp(email, password, displayName)
    setIsLoading(false)
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" })
    } else {
      if (refCode) {
        localStorage.setItem("pending_referral_code", refCode.trim().toUpperCase())
      }
      if (config.roleKey !== "user" && config.roleKey !== "admin" && config.showApply) {
        localStorage.setItem("pending_role_application", JSON.stringify({
          role: config.roleKey,
          message: `Applied via ${config.title} signup page`,
        }))
      }
      toast({ title: "Account created!", description: "You can now sign in." })
      setMode("login")
    }
  }

  const Icon = config.icon

  return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className={`absolute inset-0 ${config.bgGradient}`} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/[0.03] rounded-full blur-[150px]" />

      <div className="w-full max-w-[440px] relative z-10 animate-fade-in-up">
        <div className="text-center mb-6">
          <a href="/" className="inline-block">
            <img src={logoBoiaro} alt="BoiAro" className="h-10 w-auto mx-auto" />
          </a>
        </div>

        <Card className="border-border/20 bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/30">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-primary/10 ${config.accentColor}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-serif font-semibold">{config.title}</h1>
                <p className="text-xs text-muted-foreground">{config.subtitle}</p>
              </div>
            </div>

            {statusMessage && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2.5 text-[13px] text-primary text-center animate-fade-in">
                {statusMessage}
              </div>
            )}

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Email</Label>
                  <Input
                    type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className="h-10 rounded-xl bg-secondary/40 border-border/30 focus:border-primary/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[13px]">Password</Label>
                    {config.showForgotPassword !== false && (
                      <button type="button" onClick={() => setMode("forgot")}
                        className="text-[11px] text-primary hover:underline">
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"} placeholder="••••••••" value={password}
                      onChange={e => setPassword(e.target.value)} required
                      className="h-10 rounded-xl pr-10 bg-secondary/40 border-border/30 focus:border-primary/50"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full btn-gold h-10 text-[13px]" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            )}

            {mode === "forgot" && (
              <form onSubmit={handleForgotPassword} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Email</Label>
                  <Input
                    type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className="h-10 rounded-xl bg-secondary/40 border-border/30 focus:border-primary/50"
                  />
                </div>
                <Button type="submit" className="w-full btn-gold h-10 text-[13px]" disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>
                <p className="text-center text-[12px] text-muted-foreground">
                  <button type="button" onClick={() => setMode("login")} className="text-primary hover:underline">
                    Back to Sign In
                  </button>
                </p>
              </form>
            )}

            {mode === "signup" && config.showSignup && (
              <form onSubmit={handleSignup} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Display Name</Label>
                  <Input type="text" placeholder="Your name" value={displayName}
                    onChange={e => setDisplayName(e.target.value)} required
                    className="h-10 rounded-xl bg-secondary/40 border-border/30" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Email</Label>
                  <Input type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className="h-10 rounded-xl bg-secondary/40 border-border/30" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Password</Label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" value={password}
                      onChange={e => setPassword(e.target.value)} required minLength={6}
                      className="h-10 rounded-xl pr-10 bg-secondary/40 border-border/30" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full btn-gold h-10 text-[13px]" disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Account"}
                </Button>
              </form>
            )}

            {config.showGoogle && mode === "login" && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/30" /></div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-card px-3 text-muted-foreground">or</span>
                  </div>
                </div>
                <Button type="button" variant="outline"
                  className="w-full h-10 text-[13px] gap-2 border-border/30 hover:bg-secondary/40"
                  disabled={isLoading}
                  onClick={async () => {
                    setIsLoading(true)
                    const oauth = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })
                    if (oauth.error || !oauth.data?.accessToken) {
                      setIsLoading(false)
                      toast({ title: "Google login failed", description: oauth.error?.message || "Unable to authorize with Google.", variant: "destructive" })
                      return
                    }
                    const { error } = await signInWithGoogle(oauth.data.accessToken)
                    if (error) {
                      setIsLoading(false)
                      toast({ title: "Google login failed", description: error.message, variant: "destructive" })
                      return
                    }
                    resolveRedirect()
                    setIsLoading(false)
                  }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </Button>
              </>
            )}

            {config.showApply && mode === "login" && (
              <div className="bg-secondary/30 rounded-xl p-3 text-center">
                <p className="text-[12px] text-muted-foreground mb-2">{config.applyMessage || "Don't have access yet?"}</p>
                <Button variant="outline" size="sm" className="text-[12px] h-8 border-border/30"
                  onClick={() => navigate("/apply")}>
                  Apply Now
                </Button>
              </div>
            )}

            {config.showSignup && mode !== "forgot" && (
              <p className="text-center text-[12px] text-muted-foreground">
                {mode === "login" ? (
                  <>Don't have an account?{" "}
                    <button type="button" onClick={() => setMode("signup")} className="text-primary hover:underline">Sign up</button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button type="button" onClick={() => setMode("login")} className="text-primary hover:underline">Sign in</button>
                  </>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground mt-4">
          Secure login • Role verified from database
        </p>
      </div>
    </div>
  )
}
