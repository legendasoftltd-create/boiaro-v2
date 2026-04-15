import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface BookContributorsProps {
  bookId: string;
}

export function BookContributors({ bookId }: BookContributorsProps) {
  const [contributors, setContributors] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roleUsers, setRoleUsers] = useState<Record<string, any[]>>({});
  const [addRole, setAddRole] = useState("writer");
  const [addUserId, setAddUserId] = useState("");
  const [addFormat, setAddFormat] = useState("");

  useEffect(() => { load(); }, [bookId]);

  const load = async () => {
    const [c, r] = await Promise.all([
      supabase.from("book_contributors").select("*").eq("book_id", bookId),
      supabase.from("user_roles").select("user_id, role").in("role", ["writer", "publisher", "narrator"]),
    ]);
    setContributors(c.data || []);

    // Get profiles for role users
    const userIds = [...new Set((r.data || []).map(u => u.user_id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds);
      setProfiles(profs || []);
    }

    // Group users by role
    const grouped: Record<string, any[]> = { writer: [], publisher: [], narrator: [] };
    (r.data || []).forEach(u => {
      if (grouped[u.role]) grouped[u.role].push(u);
    });
    setRoleUsers(grouped);
  };

  const getDisplayName = (userId: string) => {
    const p = profiles.find(p => p.user_id === userId);
    return p?.display_name || userId.slice(0, 8) + "...";
  };

  const addContributor = async () => {
    if (!addUserId) { toast.error("Select a user"); return; }
    const { error } = await supabase.from("book_contributors").insert({
      book_id: bookId, user_id: addUserId, role: addRole,
      format: addFormat || null,
    });
    if (error) {
      if (error.code === "23505") toast.error("This contributor is already assigned");
      else toast.error(error.message);
      return;
    }
    toast.success("Contributor added");
    setAddUserId("");
    load();
  };

  const removeContributor = async (id: string) => {
    await supabase.from("book_contributors").delete().eq("id", id);
    toast.success("Contributor removed");
    load();
  };

  const roleBadge = (role: string) => {
    const config: Record<string, string> = {
      writer: "bg-primary/20 text-primary border-primary/30",
      publisher: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      narrator: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${config[role] || ""}`}>{role}</Badge>;
  };

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Contributors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Contributors */}
        {contributors.length > 0 ? (
          <div className="space-y-2">
            {contributors.map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-[#017B51] text-sm">
                <div className="flex items-center gap-2">
                  {roleBadge(c.role)}
                  <span className="font-medium text-white">{getDisplayName(c.user_id)}</span>
                  {c.format && <Badge variant="outline" className="text-[9px] capitalize">{c.format}</Badge>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeContributor(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No contributors assigned yet.</p>
        )}

        {/* Add Contributor */}
        <div className="grid grid-cols-4 gap-2 items-end">
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={addRole} onValueChange={(v) => { setAddRole(v); setAddUserId(""); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="writer">Writer</SelectItem>
                <SelectItem value="publisher">Publisher</SelectItem>
                <SelectItem value="narrator">Narrator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">User</Label>
            <Select value={addUserId} onValueChange={setAddUserId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {(roleUsers[addRole] || []).map(u => (
                  <SelectItem key={u.user_id} value={u.user_id}>{getDisplayName(u.user_id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Format</Label>
            <Select value={addFormat} onValueChange={setAddFormat}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Formats</SelectItem>
                <SelectItem value="ebook">eBook</SelectItem>
                <SelectItem value="audiobook">Audiobook</SelectItem>
                <SelectItem value="hardcopy">Hard Copy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-8" onClick={addContributor}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Narrator should only be assigned for audiobook format. Format "All" means the contributor earns from all formats.
        </p>
      </CardContent>
    </Card>
  );
}
