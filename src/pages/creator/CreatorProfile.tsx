import { useUserRole } from "@/hooks/useUserRole";
import WriterProfile from "@/pages/writer/WriterProfile";
import PublisherProfile from "@/pages/publisher/PublisherProfile";
import NarratorProfile from "@/pages/narrator/NarratorProfile";

export default function CreatorProfile() {
  const { hasRole } = useUserRole();

  if (hasRole("publisher")) return <PublisherProfile />;
  if (hasRole("writer")) return <WriterProfile />;
  if (hasRole("narrator")) return <NarratorProfile />;

  return <div className="text-center py-20 text-muted-foreground">No profile access.</div>;
}
