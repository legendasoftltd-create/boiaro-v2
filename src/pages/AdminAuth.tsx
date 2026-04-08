import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { Shield } from "lucide-react"

export default function AdminAuth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "admin",
        title: "Admin Login",
        titleBn: "অ্যাডমিন লগইন",
        subtitle: "BoiAro platform administration",
        icon: Shield,
        accentColor: "text-destructive",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(0_84%_60%/0.04),transparent_60%)]",
        showSignup: false,
        showApply: false,
        showGoogle: false,
      }}
    />
  )
}
