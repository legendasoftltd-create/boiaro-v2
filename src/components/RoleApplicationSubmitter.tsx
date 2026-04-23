import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export function RoleApplicationSubmitter() {
  const { user } = useAuth();
  const submitMutation = trpc.profiles.submitRoleApplication.useMutation();

  useEffect(() => {
    if (!user) return;
    const pending = localStorage.getItem("pending_role_application");
    if (!pending) return;

    try {
      const { role, message } = JSON.parse(pending);
      submitMutation.mutate({ role, message }, {
        onSettled: () => localStorage.removeItem("pending_role_application"),
      });
    } catch {
      localStorage.removeItem("pending_role_application");
    }
  }, [user]);

  return null;
}
