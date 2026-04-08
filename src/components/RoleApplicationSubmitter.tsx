import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Submits pending role applications after the user logs in.
 * The application intent is stored in localStorage during signup.
 */
export function RoleApplicationSubmitter() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const pending = localStorage.getItem("pending_role_application");
    if (!pending) return;

    try {
      const { role, message } = JSON.parse(pending);
      supabase
        .from("role_applications")
        .insert({ user_id: user.id, requested_role: role, message })
        .then(() => {
          localStorage.removeItem("pending_role_application");
        });
    } catch {
      localStorage.removeItem("pending_role_application");
    }
  }, [user]);

  return null;
}
