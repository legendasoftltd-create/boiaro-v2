import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { Radio } from "lucide-react"

export default function RjAuth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "rj",
        title: "RJ Login",
        titleBn: "আরজে লগইন",
        subtitle: "Go live and broadcast to your audience",
        icon: Radio,
        accentColor: "text-destructive",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(var(--destructive)/0.08),transparent_60%)]",
        showSignup: false,
        showApply: true,
        showGoogle: false,
        applyMessage: "Want to become an RJ? Apply now!",
        showForgotPassword: true,
      }}
    />
  )
}
