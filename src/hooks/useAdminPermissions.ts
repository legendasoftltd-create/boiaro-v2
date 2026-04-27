import { useAuth } from "@/contexts/AuthContext";

const MODULES = [
  "books", "users", "orders", "payments", "reports", "support", "content",
  "settings", "roles", "email", "notifications", "analytics", "cms",
  "subscriptions", "coupons", "shipping", "withdrawals", "revenue",
];

const MODULE_MAP: Record<string, string> = {
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

interface Permission {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const SUPER_ADMIN_PERMISSIONS: Permission[] = MODULES.map(m => ({
  module: m,
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
}));

export function useAdminPermissions() {
  const { user, loading } = useAuth();
  const isAdmin = ((user?.roles as string[]) || []).includes("admin");

  const isSuperAdmin = isAdmin;
  const permissions = isAdmin ? SUPER_ADMIN_PERMISSIONS : [];
  const roleName = isAdmin ? "super_admin" : null;

  const can = (_module: string, _action: "view" | "create" | "edit" | "delete") => {
    return isAdmin;
  };

  const canAccessPath = (_path: string) => {
    return isAdmin;
  };

  return {
    permissions,
    roleName,
    isSuperAdmin,
    isLoading: loading,
    can,
    canAccessPath,
    MODULE_MAP,
  };
}
