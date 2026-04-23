import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "moderator" | "user" | "writer" | "publisher" | "narrator" | "rj";

const PRIORITY: AppRole[] = ["admin", "publisher", "writer", "narrator", "rj", "moderator", "user"];

export function useUserRole() {
  const { user, loading } = useAuth();

  const roles = ((user?.roles as AppRole[]) || []);
  const primaryRole: AppRole = PRIORITY.find((p) => roles.includes(p)) || "user";
  const hasRole = (role: AppRole) => roles.includes(role);

  return { roles, primaryRole, hasRole, loading };
}
