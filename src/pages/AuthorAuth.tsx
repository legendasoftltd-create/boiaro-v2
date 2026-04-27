import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { PenTool } from "lucide-react"

export default function AuthorAuth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "writer",
        title: "Author Portal",
        titleBn: "লেখক পোর্টাল",
        subtitle: "Manage your books, track earnings, grow your readership",
        icon: PenTool,
        accentColor: "text-primary",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(43_70%_50%/0.08),transparent_60%)]",
        showSignup: true,
        showApply: true,
        showGoogle: true,
        applyMessage: "Not an approved author yet? Apply to join BoiAro as a writer.",
      }}
    />
  )
}
