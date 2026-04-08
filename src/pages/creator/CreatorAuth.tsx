import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { PenTool } from "lucide-react"

export default function CreatorAuth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "writer",
        title: "Creator Portal",
        titleBn: "সৃষ্টিকর্তা পোর্টাল",
        subtitle: "Manage your books, audiobooks, and earnings",
        icon: PenTool,
        accentColor: "text-primary",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(43_70%_50%/0.08),transparent_60%)]",
        showSignup: true,
        showApply: true,
        showGoogle: true,
        applyMessage: "Not an approved creator yet? Apply to join BoiAro.",
      }}
    />
  )
}
