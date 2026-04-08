import { useUserRole } from "@/hooks/useUserRole";
import WriterEarnings from "@/pages/writer/WriterEarnings";
import PublisherEarnings from "@/pages/publisher/PublisherEarnings";
import NarratorEarnings from "@/pages/narrator/NarratorEarnings";

export default function CreatorEarnings() {
  const { hasRole } = useUserRole();

  if (hasRole("publisher")) return <PublisherEarnings />;
  if (hasRole("writer")) return <WriterEarnings />;
  if (hasRole("narrator")) return <NarratorEarnings />;

  return <div className="text-center py-20 text-muted-foreground">No earnings access.</div>;
}
