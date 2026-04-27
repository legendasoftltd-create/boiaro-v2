import { useAuth } from "@/contexts/AuthContext";

export function useAdminCheck() {
  const { user, loading } = useAuth();
  const isAdmin = ((user?.roles as string[]) || []).includes("admin");
  return { isAdmin, loading };
}
