import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { KeyRound } from "lucide-react"
import logoBoiaro from "@/assets/logo_boiaro.png"

export default function ResetPassword() {
  const navigate = useNavigate()

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
                <h1 className="text-lg font-serif font-semibold">Password Reset</h1>
                <p className="text-xs text-muted-foreground">Contact support to reset your password</p>
              </div>
            </div>

            <div className="bg-secondary/40 border border-border/30 rounded-xl px-4 py-3 text-[13px] text-muted-foreground text-center">
              To reset your password, please contact support or sign in with your existing credentials.
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-10 text-[13px]"
                onClick={() => navigate("/auth")}
              >
                Sign In
              </Button>
              <Button
                className="flex-1 btn-gold h-10 text-[13px]"
                onClick={() => navigate("/")}
              >
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
