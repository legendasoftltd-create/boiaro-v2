import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface LogOptions {
  module: string;
  action: string;
  actionType?: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  oldValue?: string | Record<string, any>;
  newValue?: string | Record<string, any>;
  riskLevel?: "low" | "medium" | "high" | "critical";
  status?: "success" | "failed" | "warning" | "info";
}

export function useAdminLogger() {
  const { user } = useAuth();

  const log = useCallback(
    async (opts: LogOptions) => {
      if (!user) return;

      try {
        const profileRes = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle();

        const userName = profileRes.data?.display_name || user.email || user.id.slice(0, 8);

        await supabase.from("admin_activity_logs").insert({
          user_id: user.id,
          user_name: userName,
          action: opts.action,
          action_type: opts.actionType || opts.action,
          module: opts.module,
          target_type: opts.targetType || null,
          target_id: opts.targetId || null,
          details: opts.details || null,
          old_value: typeof opts.oldValue === "object" ? JSON.stringify(opts.oldValue) : opts.oldValue || null,
          new_value: typeof opts.newValue === "object" ? JSON.stringify(opts.newValue) : opts.newValue || null,
          risk_level: opts.riskLevel || "low",
          status: opts.status || "success",
        });
      } catch {
        // Silent fail — audit logging must never break UX
      }
    },
    [user]
  );

  const logOrderStatusChange = useCallback(
    async (orderId: string, orderNumber: string | null, oldStatus: string, newStatus: string) => {
      if (!user) return;

      try {
        const profileRes = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle();

        const userName = profileRes.data?.display_name || user.email || "";

        // Insert into order_status_history
        await supabase.from("order_status_history").insert({
          order_id: orderId,
          old_status: oldStatus,
          new_status: newStatus,
          changed_by: user.id,
          changed_by_name: userName,
        });

        // Also log to activity logs
        await log({
          module: "orders",
          action: `Status: ${oldStatus} → ${newStatus}`,
          actionType: "status_change",
          targetType: "order",
          targetId: orderId,
          details: `Order ${orderNumber || orderId.slice(0, 8)} status changed from ${oldStatus} to ${newStatus}`,
          oldValue: { status: oldStatus },
          newValue: { status: newStatus },
          riskLevel: ["cancelled", "returned"].includes(newStatus) ? "high" : "medium",
        });
      } catch {
        // Silent
      }
    },
    [user, log]
  );

  return { log, logOrderStatusChange };
}
