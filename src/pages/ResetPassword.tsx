import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Eye, EyeOff, KeyRound, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import logoBoiaro from "@/assets/logo_boiaro.png"

export default function ResetPassword() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRecovery, setIsRecovery] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    // Supabase redirects with #access_token=...&type=recovery
    const hash = window.location.hash
    if (hash.includes("type=recovery")) {
      setIsRecovery(true)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters required.", variant: "destructive" })
      return
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please re-enter your password.", variant: "destructive" })
      return
    }
    setIsLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setIsLoading(false)
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" })
    } else {
      setDone(true)
      toast({ title: "Password updated!", description: "You can now sign in with your new password." })
    }
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
                {done ? <CheckCircle2 className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
              </div>
              <div>
                <h1 className="text-lg font-serif font-semibold">
                  {done ? "Password Updated" : "Set New Password"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {done ? "You're all set!" : "Enter your new password below"}
                </p>
              </div>
            </div>

            {done ? (
              <div className="space-y-4">
                <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-3 text-[13px] text-primary text-center">
                  Your password has been reset successfully.
                </div>
                <Button className="w-full btn-gold h-10 text-[13px]" onClick={() => navigate("/auth")}>
                  Go to Sign In
                </Button>
              </div>
            ) : !isRecovery ? (
              <div className="space-y-4">
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-3 text-[13px] text-destructive text-center">
                  Invalid or expired reset link. Please request a new one.
                </div>
                <Button className="w-full btn-gold h-10 text-[13px]" onClick={() => navigate("/auth")}>
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">New Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required minLength={6}
                      className="h-10 rounded-xl pr-10 bg-secondary/40 border-border/30 focus:border-primary/50"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Confirm Password</Label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required minLength={6}
                    className="h-10 rounded-xl bg-secondary/40 border-border/30 focus:border-primary/50"
                  />
                </div>
                <Button type="submit" className="w-full btn-gold h-10 text-[13px]" disabled={isLoading}>
                  {isLoading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
