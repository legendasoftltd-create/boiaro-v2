import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { User } from "lucide-react"

// Reader auth - the default /auth page
export default function Auth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "user",
        title: "Reader Login",
        titleBn: "পাঠক লগইন",
        subtitle: "Read, Listen, Collect — all in one place",
        icon: User,
        accentColor: "text-primary",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.06),transparent_60%)]",
        showSignup: true,
        showApply: false,
        showGoogle: true,
        showFacebook: true,
      }}
    />
  )
}
