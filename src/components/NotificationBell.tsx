import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";

interface UserNotification {
  id: string;
  is_read: boolean;
  created_at: string;
  notification_id: string;
  notifications: {
    title: string;
    message: string;
    type: string;
    link: string | null;
    priority: string;
  } | null;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = items.filter((i) => !i.is_read).length;

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_notifications" as any)
      .select("id, is_read, created_at, notification_id, notifications(title, message, type, link, priority)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as any) || []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel("user-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("user_notifications" as any).update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, is_read: true } : i));
  };

  const markAllRead = async () => {
    if (!user) return;
    const unread = items.filter((i) => !i.is_read).map((i) => i.id);
    if (unread.length === 0) return;
    for (const id of unread) {
      await supabase.from("user_notifications" as any).update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    }
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
  };

  const handleClick = (item: UserNotification) => {
    markRead(item.id);
    const link = item.notifications?.link;
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  if (!user) return null;

  const typeIcon: Record<string, string> = {
    system: "🔔", order: "📦", payment: "💳", creator: "✍️", promotional: "🎉",
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "এইমাত্র";
    if (mins < 60) return `${mins} মিনিট আগে`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘণ্টা আগে`;
    return `${Math.floor(hrs / 24)} দিন আগে`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground rounded-full h-9 w-9">
          <Bell className="w-[18px] h-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="font-serif font-semibold text-sm">নোটিফিকেশন</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-[11px] text-primary h-7" onClick={markAllRead}>
                সব পড়া হিসেবে চিহ্নিত
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setOpen(false); navigate("/notification-settings"); }}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[360px]">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">কোনো নোটিফিকেশন নেই</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                className={`w-full text-left px-4 py-3 border-b border-border/20 hover:bg-secondary/40 transition-colors ${!item.is_read ? "bg-primary/5" : ""}`}
              >
                <div className="flex gap-2.5">
                  <span className="text-base mt-0.5">{typeIcon[item.notifications?.type || "system"] || "🔔"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-[13px] font-medium truncate ${!item.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                        {item.notifications?.title}
                      </p>
                      {!item.is_read && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">{item.notifications?.message}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">{timeAgo(item.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
