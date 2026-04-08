import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" },
  approved: { label: "Approved", className: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" },
  published: { label: "Published", className: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" },
  inactive: { label: "Inactive", className: "bg-red-500/20 text-red-500 border-red-500/30" },
  hidden: { label: "Hidden", className: "bg-red-500/20 text-red-500 border-red-500/30" },
  disabled: { label: "Disabled", className: "bg-red-500/20 text-red-500 border-red-500/30" },
  suspended: { label: "Suspended", className: "bg-red-500/20 text-red-500 border-red-500/30" },
  pending: { label: "Pending", className: "bg-amber-500/20 text-amber-500 border-amber-500/30" },
  confirmed: { label: "Confirmed", className: "bg-blue-500/20 text-blue-500 border-blue-500/30" },
  processing: { label: "Processing", className: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30" },
  ready_for_pickup: { label: "Ready for Pickup", className: "bg-indigo-500/20 text-indigo-500 border-indigo-500/30" },
  pickup_received: { label: "Pickup Received", className: "bg-violet-500/20 text-violet-500 border-violet-500/30" },
  in_transit: { label: "In Transit", className: "bg-purple-500/20 text-purple-500 border-purple-500/30" },
  shipped: { label: "Shipped", className: "bg-purple-500/20 text-purple-500 border-purple-500/30" },
  delivered: { label: "Delivered", className: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" },
  cancelled: { label: "Cancelled", className: "bg-red-500/20 text-red-500 border-red-500/30" },
  returned: { label: "Returned", className: "bg-orange-500/20 text-orange-500 border-orange-500/30" },
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  rejected: { label: "Rejected", className: "bg-red-500/20 text-red-500 border-red-500/30" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status?.toLowerCase()] || {
    label: status || "Unknown",
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", config.className, className)}>
      {config.label}
    </Badge>
  );
}
