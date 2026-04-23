import { Outlet, Link, useLocation, Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useUserRole } from "@/hooks/useUserRole"
import { useRjProfile } from "@/hooks/useLiveSession"
import { trpc } from "@/lib/trpc"
import { Radio, LayoutDashboard, User, LogOut, Calendar, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Dashboard", path: "/rj", icon: LayoutDashboard },
  { label: "Schedule", path: "/rj/schedule", icon: Calendar },
  { label: "Profile", path: "/rj/profile", icon: User },
]

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active = item.path === "/rj" ? pathname === "/rj" : pathname.startsWith(item.path)
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              active ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default function RjLayout() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { hasRole, loading: roleLoading } = useUserRole()
  const { profile, loading: profileLoading } = useRjProfile()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const utils = trpc.useUtils()

  const createProfileMutation = trpc.rj.createProfile.useMutation({
    onSuccess: () => utils.rj.myProfile.invalidate(),
  })

  useEffect(() => {
    if (!profileLoading && profile === null && user && hasRole("rj") && !createProfileMutation.isPending) {
      const displayName = (user.user_metadata as any)?.display_name || user.email?.split("@")[0] || "New RJ"
      createProfileMutation.mutate({ stageName: displayName })
    }
  }, [profileLoading, profile, user])

  if (authLoading || roleLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-destructive border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) return <Navigate to="/rj-auth" replace />
  if (!hasRole("rj")) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-6 px-2">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-sm font-bold">RJ Studio</h2>
            <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">
              {profile?.stage_name || "Radio Jockey"}
            </p>
          </div>
        </div>
        <NavLinks pathname={location.pathname} />
        <div className="mt-auto pt-4">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={signOut}>
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border h-14 flex items-center px-4">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <div className="flex items-center gap-2 mb-6">
              <Radio className="w-5 h-5 text-destructive" />
              <span className="font-bold text-sm">RJ Studio</span>
            </div>
            <NavLinks pathname={location.pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-8">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
                <LogOut className="w-4 h-4" /> Sign Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <span className="ml-2 font-bold text-sm">RJ Studio</span>
      </div>

      {/* Content */}
      <main className="flex-1 md:p-6 p-4 pt-16 md:pt-6 overflow-auto">
        {!profile?.is_approved && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            ⏳ Your RJ account is pending admin approval. You cannot go live until approved.
          </div>
        )}
        <Outlet context={{ profile }} />
      </main>
    </div>
  )
}
