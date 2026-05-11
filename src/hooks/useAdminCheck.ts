import { useAuth } from "@/contexts/AuthContext";

export function useAdminCheck() {
  const { user, loading } = useAuth();
  const roles = (user?.roles as string[]) || [];
  const isAdmin = roles.includes("admin") || roles.includes("moderator");
  return { isAdmin, loading };
}
