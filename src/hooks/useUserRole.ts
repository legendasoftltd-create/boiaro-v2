import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "moderator" | "user" | "writer" | "publisher" | "narrator" | "rj";

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [primaryRole, setPrimaryRole] = useState<AppRole>("user");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRoles([]);
      setPrimaryRole("user");
      setLoading(false);
      return;
    }

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const userRoles = (data || []).map((r) => r.role as AppRole);
        setRoles(userRoles);
        // Priority: admin > publisher > writer > narrator > moderator > user
        const priority: AppRole[] = ["admin", "publisher", "writer", "narrator", "rj", "moderator", "user"];
        const primary = priority.find((p) => userRoles.includes(p)) || "user";
        setPrimaryRole(primary);
        setLoading(false);
      });
  }, [user, authLoading]);

  const hasRole = (role: AppRole) => roles.includes(role);

  return { roles, primaryRole, hasRole, loading: loading || authLoading };
}
