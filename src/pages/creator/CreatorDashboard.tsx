import { useUserRole } from "@/hooks/useUserRole";
import WriterDashboard from "@/pages/writer/WriterDashboard";
import PublisherDashboard from "@/pages/publisher/PublisherDashboard";
import NarratorDashboard from "@/pages/narrator/NarratorDashboard";

export default function CreatorDashboard() {
  const { hasRole } = useUserRole();

  // Show the highest-priority creator dashboard
  if (hasRole("publisher")) return <PublisherDashboard />;
  if (hasRole("writer")) return <WriterDashboard />;
  if (hasRole("narrator")) return <NarratorDashboard />;

  return <div className="text-center py-20 text-muted-foreground">No creator access.</div>;
}
