import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Activity, BookOpen, Headphones, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export type LiveUserFilter = "online" | "reading" | "listening" | null;

interface PresenceUser {
  user_id: string;
  last_seen: string;
  activity_type: string;
  current_page: string | null;
  current_book_id: string | null;
  display_name?: string;
  book_title?: string;
}

interface Props {
  filter: LiveUserFilter;
  onClose: () => void;
}

const REFRESH_INTERVAL = 8000;

export function LiveUsersModal({ filter, onClose }: Props) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: presence } = await supabase
      .from("user_presence" as any)
      .select("user_id, last_seen, activity_type, current_page, current_book_id")
      .gte("last_seen", fiveMinAgo)
      .order("last_seen", { ascending: false });

    const rows = (presence as any[]) || [];

    // Filter by type
    const filtered = filter === "reading"
      ? rows.filter(r => r.activity_type === "reading")
      : filter === "listening"
        ? rows.filter(r => r.activity_type === "listening")
        : rows;

    if (filtered.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    // Fetch profile names
    const userIds = [...new Set(filtered.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach(p => {
      profileMap[p.user_id] = p.display_name || p.user_id.slice(0, 8);
    });

    // Fetch book titles for users with current_book_id
    const bookIds = [...new Set(filtered.map(r => r.current_book_id).filter(Boolean))];
    const bookMap: Record<string, string> = {};
    if (bookIds.length > 0) {
      const { data: books } = await supabase
        .from("books")
        .select("id, title")
        .in("id", bookIds);
      (books || []).forEach(b => {
        bookMap[b.id] = b.title;
      });
    }

    setUsers(filtered.map(r => ({
      ...r,
      display_name: profileMap[r.user_id] || r.user_id.slice(0, 8),
      book_title: r.current_book_id ? bookMap[r.current_book_id] : undefined,
    })));
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (!filter) return;
    setLoading(true);
    fetchUsers();
    const interval = setInterval(fetchUsers, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [filter, fetchUsers]);

  const title = filter === "reading"
    ? "Reading Now"
    : filter === "listening"
      ? "Listening Now"
      : "Online Now";

  const Icon = filter === "reading" ? BookOpen : filter === "listening" ? Headphones : Activity;
  const color = filter === "reading" ? "text-blue-400" : filter === "listening" ? "text-purple-400" : "text-green-400";

  return (
    <Dialog open={!!filter} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${color}`} />
            {title}
            <Badge variant="secondary" className="ml-auto text-xs">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Live
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            কোনো সক্রিয় ব্যবহারকারী নেই
            <br />
            <span className="text-xs">No active users right now</span>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-2">
              {users.map((u, i) => (
                <div
                  key={`${u.user_id}-${i}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary/60 transition-colors"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {(u.display_name || "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.display_name}</p>
                    {u.book_title ? (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {filter === "listening" ? "🎧" : "📖"} {u.book_title}
                      </p>
                    ) : u.current_page ? (
                      <p className="text-[11px] text-muted-foreground truncate">
                        📍 {u.current_page}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right shrink-0">
                    <ActivityBadge type={u.activity_type} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(u.last_seen), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          Auto-refreshes every {REFRESH_INTERVAL / 1000}s • Showing users active in last 5 minutes
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ActivityBadge({ type }: { type: string }) {
  if (type === "reading") return <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5">Reading</Badge>;
  if (type === "listening") return <Badge className="bg-purple-500/20 text-purple-400 text-[10px] px-1.5">Listening</Badge>;
  return <Badge className="bg-green-500/20 text-green-400 text-[10px] px-1.5">Browsing</Badge>;
}
