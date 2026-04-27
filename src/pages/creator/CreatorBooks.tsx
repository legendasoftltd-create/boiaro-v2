import { useUserRole } from "@/hooks/useUserRole";
import WriterBooks from "@/pages/writer/WriterBooks";
import PublisherBooks from "@/pages/publisher/PublisherBooks";

export default function CreatorBooks() {
  const { hasRole } = useUserRole();

  if (hasRole("publisher")) return <PublisherBooks />;
  if (hasRole("writer")) return <WriterBooks />;

  return <div className="text-center py-20 text-muted-foreground">No book access.</div>;
}
