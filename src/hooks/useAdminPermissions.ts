import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const MODULES = [
  "books", "users", "orders", "payments", "reports", "support", "content",
  "settings", "roles", "email", "notifications", "analytics", "cms",
  "subscriptions", "coupons", "shipping", "withdrawals", "revenue",
];

// Maps admin sidebar paths to permission modules
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

export function useAdminPermissions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-permissions", user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Get user's admin role assignment
      const { data: assignment } = await supabase
        .from("admin_user_roles")
        .select("admin_role_id, is_active, admin_roles(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      // If no assignment, check if user is admin (super admin by default)
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" as any });

      if (!isAdmin) return { roleName: null, permissions: [], isSuperAdmin: false };

      // No assignment = super admin (backwards compatible)
      if (!assignment) {
        return { roleName: "super_admin", permissions: MODULES.map(m => ({ module: m, can_view: true, can_create: true, can_edit: true, can_delete: true })), isSuperAdmin: true };
      }

      if (!assignment.is_active) {
        return { roleName: null, permissions: [], isSuperAdmin: false };
      }

      const roleName = (assignment.admin_roles as any)?.name || "unknown";
      if (roleName === "super_admin") {
        return { roleName, permissions: MODULES.map(m => ({ module: m, can_view: true, can_create: true, can_edit: true, can_delete: true })), isSuperAdmin: true };
      }

      const { data: perms } = await supabase
        .from("role_permissions")
        .select("module, can_view, can_create, can_edit, can_delete")
        .eq("role_id", assignment.admin_role_id);

      return { roleName, permissions: (perms || []) as Permission[], isSuperAdmin: false };
    },
    enabled: !!user,
  });

  const can = (module: string, action: "view" | "create" | "edit" | "delete") => {
    if (!data) return false;
    if (data.isSuperAdmin) return true;
    const perm = data.permissions.find(p => p.module === module);
    if (!perm) return false;
    return perm[`can_${action}`];
  };

  const canAccessPath = (path: string) => {
    if (!data) return false;
    if (data.isSuperAdmin) return true;
    const module = MODULE_MAP[path];
    if (!module) return true; // unknown paths allowed
    return can(module, "view");
  };

  return {
    permissions: data?.permissions || [],
    roleName: data?.roleName || null,
    isSuperAdmin: data?.isSuperAdmin || false,
    isLoading,
    can,
    canAccessPath,
    MODULE_MAP,
  };
}
