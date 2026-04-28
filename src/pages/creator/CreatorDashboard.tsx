import { useUserRole } from "@/hooks/useUserRole";
import { trpc } from "@/lib/trpc";
import WriterDashboard from "@/pages/writer/WriterDashboard";
import PublisherDashboard from "@/pages/publisher/PublisherDashboard";
import NarratorDashboard from "@/pages/narrator/NarratorDashboard";

export default function CreatorDashboard() {
  const { hasRole } = useUserRole();
  const hasPublisher = hasRole("publisher");
  const hasWriter = hasRole("writer");
  const hasNarrator = hasRole("narrator");

  const { data: publisherStats } = trpc.profiles.creatorStats.useQuery(
    { role: "publisher" },
    { enabled: hasPublisher }
  );
  const { data: writerStats } = trpc.profiles.creatorStats.useQuery(
    { role: "writer" },
    { enabled: hasWriter }
  );
  const { data: narratorStats } = trpc.profiles.creatorStats.useQuery(
    { role: "narrator" },
    { enabled: hasNarrator }
  );

  const roleCandidates: Array<{ role: "publisher" | "writer" | "narrator"; total: number }> = [];
  if (hasPublisher) roleCandidates.push({ role: "publisher", total: Number(publisherStats?.totalEarnings || 0) });
  if (hasWriter) roleCandidates.push({ role: "writer", total: Number(writerStats?.totalEarnings || 0) });
  if (hasNarrator) roleCandidates.push({ role: "narrator", total: Number(narratorStats?.totalEarnings || 0) });
  roleCandidates.sort((a, b) => b.total - a.total);
  const activeRole = roleCandidates[0]?.role;

  // Show the highest-priority creator dashboard
  if (activeRole === "publisher") return <PublisherDashboard />;
  if (activeRole === "writer") return <WriterDashboard />;
  if (activeRole === "narrator") return <NarratorDashboard />;

  return <div className="text-center py-20 text-muted-foreground">No creator access.</div>;
}
