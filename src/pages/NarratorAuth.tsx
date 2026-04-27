import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { Mic } from "lucide-react"

export default function NarratorAuth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "narrator",
        title: "Narrator Portal",
        titleBn: "কথক পোর্টাল",
        subtitle: "Record audiobooks, grow your audience, earn royalties",
        icon: Mic,
        accentColor: "text-primary",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(270_60%_50%/0.06),transparent_60%)]",
        showSignup: true,
        showApply: true,
        showGoogle: true,
        applyMessage: "Not an approved narrator yet? Apply to join BoiAro.",
      }}
    />
  )
}
