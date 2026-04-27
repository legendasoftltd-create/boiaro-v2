import { RoleAuthPage } from "@/components/auth/RoleAuthPage"
import { Building2 } from "lucide-react"

export default function PublisherAuth() {
  return (
    <RoleAuthPage
      config={{
        roleKey: "publisher",
        title: "Publisher Portal",
        titleBn: "প্রকাশক পোর্টাল",
        subtitle: "Publish books, manage inventory, track sales & earnings",
        icon: Building2,
        accentColor: "text-primary",
        bgGradient: "bg-[radial-gradient(ellipse_at_top,hsl(200_70%_50%/0.06),transparent_60%)]",
        showSignup: true,
        showApply: true,
        showGoogle: true,
        applyMessage: "Not an approved publisher yet? Apply to join BoiAro.",
      }}
    />
  )
}
