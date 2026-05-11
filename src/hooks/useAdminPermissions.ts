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

// Moderators have full view access but cannot delete or change roles/settings.
const MODERATOR_RESTRICTED: string[] = ["roles", "settings"];
const MODERATOR_PERMISSIONS: Permission[] = MODULES.map(m => ({
  module: m,
  can_view: true,
  can_create: !MODERATOR_RESTRICTED.includes(m),
  can_edit: !MODERATOR_RESTRICTED.includes(m),
  can_delete: false,
}));

export function useAdminPermissions() {
  const { user, loading } = useAuth();
  const roles = (user?.roles as string[]) || [];
  const isAdmin = roles.includes("admin");
  const isModerator = !isAdmin && roles.includes("moderator");
  const hasAccess = isAdmin || isModerator;

  const isSuperAdmin = isAdmin;
  const permissions = isAdmin ? SUPER_ADMIN_PERMISSIONS : isModerator ? MODERATOR_PERMISSIONS : [];
  const roleName = isAdmin ? "super_admin" : isModerator ? "moderator" : null;

  const can = (module: string, action: "view" | "create" | "edit" | "delete") => {
    if (!hasAccess) return false;
    const perm = permissions.find(p => p.module === module);
    if (!perm) return isAdmin;
    return perm[`can_${action}`];
  };

  const canAccessPath = (path: string) => {
    if (!hasAccess) return false;
    if (isAdmin) return true;
    // Moderators cannot access roles or settings pages
    const module = MODULE_MAP[path];
    if (!module) return true;
    return !MODERATOR_RESTRICTED.includes(module);
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
