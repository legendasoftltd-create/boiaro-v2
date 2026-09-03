import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export const MODULE_MAP: Record<string, string> = {
  // Dashboard / Reports
  "/admin":                     "reports",
  "/admin/weekly-report":       "reports",
  "/admin/performance":         "reports",
  "/admin/live-monitoring":     "reports",
  "/admin/alerts":              "reports",
  "/admin/system-logs":         "reports",
  "/admin/db-health":           "settings",
  "/admin/backup-status":       "settings",
  "/admin/r2-dashboard":        "settings",

  // Analytics
  "/admin/analytics":           "analytics",
  "/admin/user-analytics":      "analytics",
  "/admin/reading-analytics":   "analytics",
  "/admin/ad-reports":          "analytics",
  "/admin/recommendations":     "analytics",

  // Books / Content
  "/admin/books":               "books",
  "/admin/authors":             "content",
  "/admin/narrators":           "content",
  "/admin/publishers":          "content",
  "/admin/categories":          "content",
  "/admin/submissions":         "content",
  "/admin/reviews":             "content",
  "/admin/tts-management":      "content",

  // Users & Roles
  "/admin/users":               "users",
  "/admin/user":                "users",
  "/admin/applications":        "users",
  "/admin/creator-permissions": "users",
  "/admin/roles":               "roles",
  "/admin/activity-logs":       "roles",

  // Orders & Finance
  "/admin/orders":              "orders",
  "/admin/payments":            "payments",
  "/admin/wallets":             "payments",
  "/admin/payment-gateways":    "settings",
  "/admin/revenue":             "revenue",
  "/admin/revenue-dashboard":   "revenue",
  "/admin/revenue-audit":       "revenue",
  "/admin/earnings":            "revenue",
  "/admin/accounting":          "revenue",
  "/admin/financial-reports":   "revenue",
  "/admin/investor-report":     "revenue",
  "/admin/purchase-report":     "revenue",
  "/admin/withdrawals":         "withdrawals",

  // Subscriptions / Coupons / Coins
  "/admin/subscriptions":       "subscriptions",
  "/admin/coupons":             "coupons",
  "/admin/coin-settings":       "settings",
  "/admin/coin-packages":       "settings",

  // Shipping
  "/admin/shipping":            "shipping",
  "/admin/free-shipping":       "shipping",

  // Marketing / Ads
  "/admin/banners":             "cms",
  "/admin/ad-placements":       "settings",
  "/admin/ad-banners":          "settings",
  "/admin/ad-campaigns":        "settings",
  "/admin/ad-settings":         "settings",
  "/admin/analytics-settings":  "settings",
  "/admin/referrals":           "settings",
  "/admin/gamification":        "settings",
  "/admin/drm-settings":        "settings",

  // CMS
  "/admin/pages":               "cms",
  "/admin/blog":                "cms",
  "/admin/homepage-sections":   "cms",
  "/admin/radio":               "cms",
  "/admin/rj-management":       "cms",
  "/admin/social-live":         "cms",
  "/admin/site-settings":       "settings",

  // Notifications / Email
  "/admin/notifications":       "notifications",
  "/admin/email-templates":     "email",
  "/admin/email-logs":          "email",
  "/admin/email-settings":      "email",
  "/admin/sms":                 "notifications",

  // Support
  "/admin/tickets":             "support",
  "/admin/ticket":              "support",
};

export function useAdminPermissions() {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading: queryLoading } = trpc.admin.myPermissions.useQuery(undefined, {
    enabled: !!user && !authLoading,
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = authLoading || (!!user && queryLoading);
  const permissions = data?.permissions ?? [];
  const roleName = data?.roleName ?? null;
  const isSuperAdmin = data?.isSuperAdmin ?? false;
  const hasAccess = !!roleName;

  const can = (module: string, action: "view" | "create" | "edit" | "delete"): boolean => {
    if (!hasAccess) return false;
    if (isSuperAdmin) return true;
    const perm = permissions.find(p => p.module === module);
    if (!perm) return false;
    return perm[`can_${action}`];
  };

  const canAccessPath = (path: string): boolean => {
    if (!hasAccess) return false;
    if (isSuperAdmin) return true;

    // Exact match
    const module = MODULE_MAP[path];
    if (module) return can(module, "view");

    // Prefix match for sub-paths like /admin/users/abc123
    const parent = Object.entries(MODULE_MAP)
      .filter(([p]) => path.startsWith(p + "/"))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (parent) return can(parent[1], "view");

    // Not mapped — deny by default (prevents direct URL bypass)
    return false;
  };

  return {
    permissions,
    roleName,
    isSuperAdmin,
    isLoading,
    can,
    canAccessPath,
    MODULE_MAP,
  };
}
