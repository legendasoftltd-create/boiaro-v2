import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";

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
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rolesLoading || !user) { setLoading(false); return; }

    supabase
      .from("user_permission_overrides")
      .select("permission_key, is_allowed")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        (data || []).forEach(o => { map[o.permission_key] = o.is_allowed; });
        setOverrides(map);
        setLoading(false);
      });
  }, [user, rolesLoading]);

  const hasPermission = (perm: FormatPermission): boolean => {
    // Override takes priority
    if (perm in overrides) return overrides[perm];
    // Fallback to role defaults
    return roles.some(role => (ROLE_DEFAULTS[role] || []).includes(perm));
  };

  const canAddFormat = (format: "ebook" | "audiobook" | "hardcopy") => {
    return hasPermission(`add_${format}` as FormatPermission);
  };

  return { hasPermission, canAddFormat, loading: loading || rolesLoading };
}
