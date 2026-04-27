import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link2, User, BookOpen, Mic, Building2 } from "lucide-react";
import { Link } from "react-router-dom";

interface CreatorLink {
  id: string;
  name: string;
  name_en?: string;
  avatar_url?: string;
  logo_url?: string;
  status: string;
}

interface CreatorLinks {
  authors: CreatorLink[];
  publishers: CreatorLink[];
  narrators: CreatorLink[];
}

interface CreatorLinkSummaryProps {
  userId: string;
}

export function CreatorLinkSummary({ userId }: CreatorLinkSummaryProps) {
  const { data: links, isLoading: loading } = trpc.admin.getCreatorLinksByUser.useQuery(
    { userId },
    { enabled: !!userId, staleTime: 60_000 }
  );

  const totalLinks = (links?.authors?.length || 0) + (links?.publishers?.length || 0) + (links?.narrators?.length || 0);

  if (loading) return null;
  if (!links || totalLinks === 0) return null;

  const iconMap = {
    author: BookOpen,
    publisher: Building2,
    narrator: Mic,
  };

  const renderLinks = (items: CreatorLink[], type: "author" | "publisher" | "narrator") => {
    if (!items.length) return null;
    const Icon = iconMap[type];
    return items.map((item) => (
      <Link
        key={item.id}
        to={`/admin/user/${type}/${item.id}`}
        className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors border border-border/20"
      >
        <Avatar className="h-9 w-9">
          <AvatarImage src={item.avatar_url || item.logo_url || undefined} />
          <AvatarFallback className="bg-secondary text-muted-foreground">
            <Icon className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.name}</p>
          {item.name_en && <p className="text-[11px] text-muted-foreground truncate">{item.name_en}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant="outline" className="text-[10px] capitalize">{type}</Badge>
          <Badge
            variant={item.status === "active" ? "secondary" : "outline"}
            className={`text-[10px] ${item.status === "active" ? "border-primary/20" : "text-muted-foreground"}`}
          >
            {item.status}
          </Badge>
        </div>
      </Link>
    ));
  };

  return (
    <Card className="border-border/30 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Creator Profile Links
          <Badge variant="secondary" className="text-[10px] ml-1">{totalLinks}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {renderLinks(links.authors, "author")}
        {renderLinks(links.publishers, "publisher")}
        {renderLinks(links.narrators, "narrator")}
      </CardContent>
    </Card>
  );
}
