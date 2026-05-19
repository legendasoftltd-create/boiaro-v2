import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import logoBoiaro from "@/assets/logo_boiaro.png"

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [email, setEmail] = useState(params.get("email") ?? "")
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [done, setDone] = useState(false)

  const resetMutation = trpc.auth.confirmPasswordReset.useMutation({
    onSuccess: () => setDone(true),
    onError: (err) => toast.error(err.message || "Invalid OTP or email"),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { toast.error("Enter your email"); return }
    if (otp.length !== 6) { toast.error("OTP must be 6 digits"); return }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return }
    if (password !== confirm) { toast.error("Passwords do not match"); return }
    resetMutation.mutate({ email: email.trim(), otp, password })
  }

  return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.06),transparent_60%)]" />
      <div className="w-full max-w-[440px] relative z-10 animate-fade-in-up">

        <div className="text-center mb-6">
          <a href="/" className="inline-block">
            <img src={logoBoiaro} alt="BoiAro" className="h-10 w-auto mx-auto" />
          </a>
        </div>

        <Card className="border-border/20 bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/30">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-serif font-semibold">Reset Password</h1>
                <p className="text-xs text-muted-foreground">Enter the OTP sent to your email</p>
              </div>
            </div>

            {done ? (
              <div className="space-y-4 text-center py-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <p className="text-sm font-medium">Password reset successfully!</p>
                <p className="text-xs text-muted-foreground">You can now sign in with your new password.</p>
                <Button className="w-full btn-gold" onClick={() => navigate("/auth")}>
                  Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="h-10"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px]">OTP Code</Label>
                  <Input
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code from email"
                    className="h-10 tracking-[0.3em] text-center font-mono text-lg"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <p className="text-[11px] text-muted-foreground">Check your inbox — the OTP expires in 15 minutes.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px]">New Password</Label>
                  <div className="relative">
                    <Input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="h-10 pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px]">Confirm Password</Label>
                  <Input
                    type={showPw ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    className="h-10"
                    autoComplete="new-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full btn-gold h-10 text-[13px]"
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Resetting…</>
                    : "Reset Password"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Remember your password?{" "}
                  <button type="button" onClick={() => navigate("/auth")} className="text-primary hover:underline">
                    Sign In
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
