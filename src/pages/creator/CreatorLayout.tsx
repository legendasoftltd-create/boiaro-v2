import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import {
  LayoutDashboard, BookOpen, Mic2, DollarSign, User, Package,
  ChevronLeft, ChevronRight, LogOut, Menu,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const CREATOR_ROLES: AppRole[] = ["writer", "publisher", "narrator"];

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  roles: AppRole[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/creator", icon: LayoutDashboard, roles: ["writer", "publisher", "narrator"] },
  { label: "My Books", path: "/creator/books", icon: BookOpen, roles: ["writer", "publisher"] },
  { label: "Audiobooks", path: "/creator/audiobooks", icon: Mic2, roles: ["narrator"] },
  { label: "Inventory", path: "/creator/inventory", icon: Package, roles: ["publisher"] },
  { label: "Earnings", path: "/creator/earnings", icon: DollarSign, roles: ["writer", "publisher", "narrator"] },
  { label: "Profile", path: "/creator/profile", icon: User, roles: ["writer", "publisher", "narrator"] },
];

function NavLinks({
  items,
  location,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  location: { pathname: string };
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
      {items.map((item) => {
        const active = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export default function CreatorLayout() {
  const { user, loading: authLoading } = useAuth();
  const { roles, hasRole, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const isCreator = CREATOR_ROLES.some((r) => hasRole(r));
  if (!isCreator) return <Navigate to="/dashboard" replace />;

  const visibleItems = navItems.filter((item) =>
    item.roles.some((r) => hasRole(r))
  );

  const panelTitle = hasRole("publisher")
    ? "Publisher"
    : hasRole("writer")
    ? "Writer"
    : "Narrator";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile: top bar + sheet drawer */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-40 h-14 bg-card/80 backdrop-blur-sm border-b border-border/40 flex items-center px-3 gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col">
              <div className="p-3 flex items-center border-b border-border/40 h-14">
                <span className="font-bold text-primary font-serif text-lg">{panelTitle} Panel</span>
              </div>
              <NavLinks items={visibleItems} location={location} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <div className="p-2 border-t border-border/40">
                <Link
                  to="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Back to Site</span>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-bold text-primary font-serif text-base">{panelTitle} Panel</span>
        </div>
      )}

      {/* Desktop: sticky sidebar */}
      {!isMobile && (
        <aside
          className={cn(
            "sticky top-0 h-screen flex flex-col border-r border-border/40 bg-card/60 backdrop-blur-sm transition-all duration-200",
            collapsed ? "w-[60px]" : "w-56"
          )}
        >
          <div className="p-3 flex items-center justify-between border-b border-border/40 h-14">
            {!collapsed && (
              <span className="font-bold text-primary font-serif text-lg">{panelTitle}</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCollapsed(!collapsed)}
              className="shrink-0 h-8 w-8 rounded-lg"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
          <NavLinks items={visibleItems} location={location} collapsed={collapsed} />
          <div className="p-2 border-t border-border/40">
            <Link
              to="/"
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Back to Site</span>}
            </Link>
          </div>
        </aside>
      )}

      <main className={cn("flex-1 overflow-y-auto", isMobile && "pt-14")}>
        <div className="p-5 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}