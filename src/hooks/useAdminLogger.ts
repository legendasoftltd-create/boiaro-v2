import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
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
  const logMutation = trpc.admin.logAction.useMutation();

  const log = useCallback(
    async (opts: LogOptions) => {
      if (!user) return;
      try {
        await logMutation.mutateAsync({
          action: opts.action,
          module: opts.module,
          targetId: opts.targetId,
          targetType: opts.targetType,
          details: opts.details,
          riskLevel: opts.riskLevel || "low",
        });
      } catch {
        // Silent fail — audit logging must never break UX
      }
    },
    [user, logMutation]
  );

  const logOrderStatusChange = useCallback(
    async (orderId: string, orderNumber: string | null, oldStatus: string, newStatus: string) => {
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
    },
    [log]
  );

  return { log, logOrderStatusChange };
}
