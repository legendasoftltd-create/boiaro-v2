import { Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import {
  LayoutDashboard, BookOpen, Users, Mic2, Building2, ShoppingCart,
  Star, Layers, ChevronLeft, ChevronRight, LogOut, CreditCard, UserCheck, DollarSign, Wallet, FileCheck, Settings, Truck, Crown, Ticket, Bell, Mail, FileText, BarChart3, PanelTop, Newspaper, Globe, ImageIcon, HeadphonesIcon, Shield, Activity, Coins, LayoutGrid, Megaphone, MonitorPlay, Sparkles, Gift, ChevronDown, Menu, AlertTriangle, MessageSquare, Package, ShieldCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logoBoiaroFallback from "@/assets/logo_boiaro.png"
import logoBoiaroShortFallback from "@/assets/logo_boiaro_short.png"
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { label: "Overview", path: "/admin", icon: LayoutDashboard },
      { label: "Weekly Report", path: "/admin/weekly-report", icon: BarChart3 },
      { label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
      { label: "Live Monitoring", path: "/admin/live-monitoring", icon: Activity },
      { label: "R2 CDN Rollout", path: "/admin/r2-dashboard", icon: MonitorPlay },
      { label: "DB Health", path: "/admin/db-health", icon: Activity },
      { label: "Backup Status", path: "/admin/backup-status", icon: Shield },
      { label: "Reading Reports", path: "/admin/reading-analytics", icon: Activity },
    ],
  },
  {
    label: "Books",
    icon: BookOpen,
    items: [
      { label: "All Books", path: "/admin/books", icon: BookOpen },
      { label: "Categories", path: "/admin/categories", icon: Layers },
      { label: "Submissions", path: "/admin/submissions", icon: FileCheck },
      { label: "Reviews", path: "/admin/reviews", icon: Star },
      { label: "Recommendations", path: "/admin/recommendations", icon: Sparkles },
      { label: "DRM / Protection", path: "/admin/drm-settings", icon: Shield },
    ],
  },
  {
    label: "Creators",
    icon: Users,
    items: [
      { label: "Authors", path: "/admin/authors", icon: Users },
      { label: "Narrators", path: "/admin/narrators", icon: Mic2 },
      { label: "Publishers", path: "/admin/publishers", icon: Building2 },
      { label: "Applications", path: "/admin/applications", icon: UserCheck },
      { label: "Creator Perms", path: "/admin/creator-permissions", icon: Shield },
    ],
  },
  {
    label: "Users & Roles",
    icon: UserCheck,
    items: [
      { label: "Users", path: "/admin/users", icon: Users },
      { label: "Roles", path: "/admin/roles", icon: Shield },
    ],
  },
  {
    label: "Orders & Finance",
    icon: ShoppingCart,
    items: [
      { label: "Orders", path: "/admin/orders", icon: ShoppingCart },
      { label: "Payments", path: "/admin/payments", icon: CreditCard },
      { label: "Gateways", path: "/admin/payment-gateways", icon: Settings },
      { label: "Financial Reports", path: "/admin/financial-reports", icon: BarChart3 },
      { label: "Investor Summary", path: "/admin/investor-report", icon: FileText },
      { label: "Revenue Splits", path: "/admin/revenue", icon: DollarSign },
      { label: "Earnings", path: "/admin/earnings", icon: DollarSign },
      { label: "Accounting", path: "/admin/accounting", icon: Wallet },
      { label: "Withdrawals", path: "/admin/withdrawals", icon: Wallet },
      { label: "Shipping", path: "/admin/shipping", icon: Truck },
      { label: "Free Shipping", path: "/admin/free-shipping", icon: Truck },
      { label: "Subscriptions", path: "/admin/subscriptions", icon: Crown },
      { label: "Coupons", path: "/admin/coupons", icon: Ticket },
      { label: "Wallets", path: "/admin/wallets", icon: Wallet },
      { label: "Coin Settings", path: "/admin/coin-settings", icon: Coins },
      { label: "Coin Packages", path: "/admin/coin-packages", icon: Gift },
      { label: "Purchase Report", path: "/admin/purchase-report", icon: Package },
      { label: "Revenue Audit", path: "/admin/revenue-audit", icon: ShieldCheck },
    ],
  },
  {
    label: "Marketing & Ads",
    icon: Megaphone,
    items: [
      { label: "Banners", path: "/admin/banners", icon: ImageIcon },
      { label: "Ad Placements", path: "/admin/ad-placements", icon: LayoutGrid },
      { label: "Ad Banners", path: "/admin/ad-banners", icon: MonitorPlay },
      { label: "Ad Campaigns", path: "/admin/ad-campaigns", icon: Megaphone },
      { label: "Ad Settings", path: "/admin/ad-settings", icon: Settings },
      { label: "Ad Reports", path: "/admin/ad-reports", icon: BarChart3 },
      { label: "Referrals", path: "/admin/referrals", icon: Gift },
      { label: "Gamification", path: "/admin/gamification", icon: Sparkles },
    ],
  },
  {
    label: "CMS & Content",
    icon: Globe,
    items: [
      { label: "Pages", path: "/admin/pages", icon: Globe },
      { label: "Blog", path: "/admin/blog", icon: Newspaper },
      { label: "Homepage", path: "/admin/homepage-sections", icon: PanelTop },
      { label: "Live Radio", path: "/admin/radio", icon: HeadphonesIcon },
      { label: "RJ Management", path: "/admin/rj-management", icon: Mic2 },
      { label: "Site Settings", path: "/admin/site-settings", icon: Settings },
    ],
  },
  {
    label: "Notifications",
    icon: Bell,
    items: [
      { label: "Push / In-App", path: "/admin/notifications", icon: Bell },
      { label: "Email Templates", path: "/admin/email-templates", icon: FileText },
      { label: "Email Logs", path: "/admin/email-logs", icon: Mail },
      { label: "Email Settings", path: "/admin/email-settings", icon: Settings },
      { label: "SMS Center", path: "/admin/sms", icon: MessageSquare },
    ],
  },
  {
    label: "Support & Logs",
    icon: Activity,
    items: [
      { label: "System Alerts", path: "/admin/alerts", icon: ShieldCheck },
      { label: "Support Tickets", path: "/admin/tickets", icon: HeadphonesIcon },
      { label: "Activity Logs", path: "/admin/activity-logs", icon: Activity },
      { label: "System Logs", path: "/admin/system-logs", icon: AlertTriangle },
    ],
  },
];

function SidebarNav({
  collapsed,
  canAccessPath,
  location,
  openGroups,
  toggleGroup,
  onNavigate,
}: {
  collapsed: boolean;
  canAccessPath: (path: string) => boolean;
  location: { pathname: string };
  openGroups: Set<number>;
  toggleGroup: (idx: number) => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 py-2 px-2 overflow-y-auto space-y-0.5">
      {navGroups.map((group, gIdx) => {
        const visibleItems = group.items.filter((item) => canAccessPath(item.path));
        if (visibleItems.length === 0) return null;

        const isOpen = openGroups.has(gIdx);
        const hasActive = visibleItems.some((item) => location.pathname === item.path);

        if (collapsed) {
          return (
            <div key={gIdx} className="space-y-0.5">
              {visibleItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={item.label}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center justify-center p-2 rounded-lg transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 "
                        : "text-muted-foreground hover:bg-blue hover:text-black"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                  </Link>
                );
              })}
            </div>
          );
        }

        return (
          <div key={gIdx}>
            <button
              onClick={() => toggleGroup(gIdx)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition-colors",
                hasActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <group.icon className="h-3.5 w-3.5 shrink-0 text-black" />
              <span className={cn(
    "flex-1 text-left hover:text-black",
    hasActive ? "text-[#017B51]" : ""
  )}>{group.label}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-black",
                  isOpen ? "rotate-0" : "-rotate-90"
                )}
              />
            </button>

            {isOpen && (
              <div className="ml-3 pl-2.5 border-l border-border/30 space-y-0.5 mt-0.5 mb-1">
                {visibleItems.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                        active
                          ? "bg-[#017B51] text-white shadow-sm shadow-primary/20"
                          : "text-muted-foreground hover:bg-[#017B51] hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const { isAdmin, loading } = useAdminCheck();
  const { canAccessPath, isLoading: permLoading } = useAdminPermissions();
  const { get } = useSiteSettings()
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Dynamic logos from site settings, falling back to static assets
    const logoDesktop = get("logo_url") || logoBoiaroFallback
    const logoMobile = get("logo_mobile_url") || logoBoiaroShortFallback
    const logoDark = get("logo_dark_url")
    const brandName = get("brand_name", "BoiAro")

  const { data: unresolvedCount = 0 } = useQuery({
    queryKey: ["admin-unresolved-alerts-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("system_alerts")
        .select("id", { count: "exact", head: true })
        .eq("is_resolved", false);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const activeGroupIndices = navGroups
    .map((g, i) => (g.items.some((item) => location.pathname === item.path) ? i : -1))
    .filter((i) => i !== -1);

  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set(activeGroupIndices));

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleGroup = (idx: number) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (loading || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const sidebarContent = (
    <>
      <SidebarNav
        collapsed={false}
        canAccessPath={canAccessPath}
        location={location}
        openGroups={openGroups}
        toggleGroup={toggleGroup}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className="p-2 border-t border-border/40">
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:bg-[#017B51]hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Back to Site</span>
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile: top bar + sheet drawer */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-40 h-14 bg-white backdrop-blur-sm border-b border-border/40 flex items-center px-3 gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 bg-[#017B51]">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col">
              <div className="p-3 flex items-center justify-between border-b border-border/40 h-14">
                {/* <span className="font-bold text-primary font-serif text-lg">BoiAro Admin</span> */}
                <img src={logoDesktop} alt={brandName} className="h-9 w-auto" />
              </div>
              {sidebarContent}
            </SheetContent>
          </Sheet>
          {/* <span className="font-bold text-primary font-serif text-base flex-1">BoiAro Admin</span> */}
          {unresolvedCount > 0 && (
            <Link to="/admin/alerts" className="relative">
              <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive">
                <ShieldCheck className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold ring-2 ring-background">
                  {unresolvedCount > 9 ? "9+" : unresolvedCount}
                </span>
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Desktop: sticky sidebar */}
      {!isMobile && (
        <aside
          className={cn(
            "sticky top-0 h-screen flex flex-col border-r border-border/40 bg-white backdrop-blur-sm transition-all duration-200",
            collapsed ? "w-[60px]" : "w-56"
          )}
        >
          <div className="p-3 flex items-center justify-between border-b border-border/40 h-14">
            {!collapsed && <img src={logoDesktop} alt={brandName} className="h-9 w-auto" />}
            
            {unresolvedCount > 0 && (
              <Link to="/admin/alerts" className="relative">
                <ShieldCheck className="h-4 w-4 text-destructive" />
                <span className="absolute -top-1.5 -right-1.5 w-[14px] h-[14px] rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                  {unresolvedCount > 9 ? "9+" : unresolvedCount}
                </span>
              </Link>
            )}
            <Button size="icon" variant="ghost" onClick={() => setCollapsed(!collapsed)} className="shrink-0 h-8 w-8 rounded-lg text-black hover:bg-[#017B51] hover:text-white">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4 " />}
            </Button>
          </div>
          <SidebarNav
            collapsed={collapsed}
            canAccessPath={canAccessPath}
            location={location}
            openGroups={openGroups}
            toggleGroup={toggleGroup}
          />
          <div className="p-2 border-t border-border/40">
            <Link
              to="/"
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:bg-[#017B51] hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Back to Site</span>}
            </Link>
          </div>
        </aside>
      )}

      <main className={cn("flex-1 overflow-y-auto", isMobile && "pt-14")}>
        {/* p-5 max-w-7xl min-h-screen mx-auto */}
        <div className="p-5 w-full min-h-screen mx-auto" style={{backgroundColor:'#F9FAFB'}}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}