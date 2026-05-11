import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export const MODULE_MAP: Record<string, string> = {
  "/admin": "reports",
  "/admin/books": "books",
  "/admin/authors": "content",
  "/admin/narrators": "content",
  "/admin/publishers": "content",
  "/admin/orders": "orders",
  "/admin/payments": "payments",
  "/admin/payment-gateways": "settings",
  "/admin/reviews": "content",
  "/admin/categories": "content",
  "/admin/applications": "users",
  "/admin/submissions": "content",
  "/admin/shipping": "shipping",
  "/admin/subscriptions": "subscriptions",
  "/admin/coupons": "coupons",
  "/admin/revenue": "revenue",
  "/admin/withdrawals": "withdrawals",
  "/admin/notifications": "notifications",
  "/admin/email-templates": "email",
  "/admin/email-logs": "email",
  "/admin/email-settings": "email",
  "/admin/analytics": "analytics",
  "/admin/users": "users",
  "/admin/pages": "cms",
  "/admin/blog": "cms",
  "/admin/homepage-sections": "cms",
  "/admin/banners": "cms",
  "/admin/tickets": "support",
  "/admin/roles": "roles",
  "/admin/activity-logs": "roles",
  "/admin/wallets": "payments",
  "/admin/coin-settings": "settings",
  "/admin/ad-placements": "settings",
  "/admin/ad-banners": "settings",
  "/admin/ad-campaigns": "settings",
  "/admin/ad-settings": "settings",
  "/admin/ad-reports": "analytics",
  "/admin/recommendations": "analytics",
  "/admin/drm-settings": "settings",
  "/admin/referrals": "settings",
  "/admin/gamification": "settings",
  "/admin/creator-permissions": "users",
  "/admin/site-settings": "settings",
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
    // Exact match in MODULE_MAP
    const module = MODULE_MAP[path];
    if (module) return can(module, "view");
    // Prefix match for sub-paths like /admin/users/123
    const parent = Object.entries(MODULE_MAP)
      .filter(([p]) => path.startsWith(p + "/"))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (parent) return can(parent[1], "view");
    // Not in MODULE_MAP — don't restrict (dashboard overview, etc.)
    return true;
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
