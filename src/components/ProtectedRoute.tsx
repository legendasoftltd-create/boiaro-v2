import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";

interface Props {
  children: React.ReactNode;
  requiredRole?: AppRole | AppRole[];
  loginPath?: string;
  deniedPath?: string;
}

export function ProtectedRoute({ children, requiredRole, loginPath = "/auth", deniedPath = "/dashboard" }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { hasRole, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    if (loginPath === "/auth") {
      const dest = window.location.pathname + window.location.search
      if (dest !== "/" && dest !== "/auth") {
        sessionStorage.setItem("post_login_redirect", dest)
      }
    }
    return <Navigate to={loginPath} replace />;
  }

  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const hasAny = roles.some((r) => hasRole(r));
    if (!hasAny) return <Navigate to={deniedPath} replace />;
  }

  return <>{children}</>;
}
