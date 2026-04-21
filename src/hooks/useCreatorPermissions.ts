import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { trpc } from "@/lib/trpc";

export type FormatPermission = "add_ebook" | "add_audiobook" | "add_hardcopy" | "edit_all_content" | "delete_content" | "publish_directly" | "manage_revenue";

const ROLE_DEFAULTS: Record<string, FormatPermission[]> = {
  writer: ["add_ebook"],
  narrator: ["add_audiobook"],
  publisher: ["add_ebook", "add_audiobook", "add_hardcopy"],
  admin: ["add_ebook", "add_audiobook", "add_hardcopy", "edit_all_content", "delete_content", "publish_directly", "manage_revenue"],
};

export function useCreatorPermissions() {
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useUserRole();

  const overridesQuery = trpc.profiles.permissionOverrides.useQuery(undefined, {
    enabled: !!user,
  });

  const overrides: Record<string, boolean> = {};
  ((overridesQuery.data as any[]) || []).forEach((o: any) => {
    overrides[o.permission_key] = o.is_allowed;
  });

  const hasPermission = (perm: FormatPermission): boolean => {
    if (perm in overrides) return overrides[perm];
    return roles.some((role) => (ROLE_DEFAULTS[role] || []).includes(perm));
  };

  const canAddFormat = (format: "ebook" | "audiobook" | "hardcopy") =>
    hasPermission(`add_${format}` as FormatPermission);

  return {
    hasPermission,
    canAddFormat,
    loading: rolesLoading || overridesQuery.isLoading,
  };
}
