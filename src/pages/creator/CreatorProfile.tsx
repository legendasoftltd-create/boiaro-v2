import { useUserRole } from "@/hooks/useUserRole";
import WriterProfile from "@/pages/writer/WriterProfile";
import PublisherProfile from "@/pages/publisher/PublisherProfile";
import NarratorProfile from "@/pages/narrator/NarratorProfile";
import TranslatorProfile from "@/pages/translator/TranslatorProfile";

export default function CreatorProfile() {
  const { hasRole } = useUserRole();

  if (hasRole("publisher")) return <PublisherProfile />;
  if (hasRole("writer")) return <WriterProfile />;
  if (hasRole("narrator")) return <NarratorProfile />;
  if (hasRole("translator")) return <TranslatorProfile />;

  return <div className="text-center py-20 text-muted-foreground">No profile access.</div>;
}
