import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { PenTool } from "lucide-react"

export default function WriterAuth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "writer",
        title: "Writer Portal",
        titleBn: "লেখক পোর্টাল",
        subtitle: "Write, publish, and earn — your stories deserve the spotlight",
        icon: PenTool,
        accentColor: "text-primary",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(43_70%_50%/0.08),transparent_60%)]",
        showSignup: true,
        showApply: true,
        showGoogle: true,
        applyMessage: "Not an approved writer yet? Apply to join BoiAro as a writer.",
      }}
    />
  )
}
