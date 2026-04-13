import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const ALL_PERMISSIONS = [
  { key: "add_ebook", label: "Add eBook", desc: "Can submit eBook formats" },
  { key: "add_audiobook", label: "Add Audiobook", desc: "Can submit audiobook formats" },
  { key: "add_hardcopy", label: "Add Hard Copy", desc: "Can submit hardcopy formats" },
  { key: "edit_all_content", label: "Edit All Content", desc: "Can edit any content, not just own" },
  { key: "delete_content", label: "Delete Content", desc: "Can delete submitted content" },
  { key: "publish_directly", label: "Publish Directly", desc: "Skip approval workflow" },
  { key: "manage_revenue", label: "Manage Revenue", desc: "Can manage revenue splits" },
];

export default function AdminUserPermissions() {
  const { user: admin } = useAuth();
  const [creators, setCreators] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCreators(); }, []);

  const loadCreators = async () => {
    const { data: roleUsers } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["writer", "publisher", "narrator"]);
    
    const userIds = [...new Set((roleUsers || []).map(r => r.user_id))];
    if (!userIds.length) { setCreators([]); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    const roleMap: Record<string, string[]> = {};
    (roleUsers || []).forEach(r => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    setCreators((profiles || []).map(p => ({
      ...p,
      roles: roleMap[p.user_id] || [],
    })));
  };

  const openUser = async (creator: any) => {
    setSelectedUser(creator);
    const { data } = await supabase
      .from("user_permission_overrides")
      .select("permission_key, is_allowed")
      .eq("user_id", creator.user_id);

    const map: Record<string, boolean | null> = {};
    ALL_PERMISSIONS.forEach(p => { map[p.key] = null; }); // null = use role default
    (data || []).forEach(o => { map[o.permission_key] = o.is_allowed; });
    setOverrides(map);
  };

  const toggleOverride = (key: string) => {
    setOverrides(prev => {
      const current = prev[key];
      // Cycle: null (default) -> true (allow) -> false (deny) -> null
      const next = current === null ? true : current === true ? false : null;
      return { ...prev, [key]: next };
    });
  };

  const saveOverrides = async () => {
    if (!selectedUser || !admin) return;
    setSaving(true);

    // Delete all existing overrides for this user
    await supabase.from("user_permission_overrides").delete().eq("user_id", selectedUser.user_id);

    // Insert non-null overrides
    const toInsert = Object.entries(overrides)
      .filter(([, v]) => v !== null)
      .map(([key, is_allowed]) => ({
        user_id: selectedUser.user_id,
        permission_key: key,
        is_allowed: is_allowed as boolean,
        granted_by: admin.id,
      }));

    if (toInsert.length > 0) {
      const { error } = await supabase.from("user_permission_overrides").insert(toInsert);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    toast.success("Permissions saved");
    setSaving(false);
    setSelectedUser(null);
  };

  const filtered = creators.filter(c =>
    !search || (c.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const roleBadge = (role: string) => {
    const cls: Record<string, string> = {
      writer: "bg-primary/20 text-primary",
      publisher: "bg-purple-500/20 text-purple-400",
      narrator: "bg-blue-500/20 text-blue-400",
    };
    return <Badge key={role} variant="outline" className={`text-[10px] capitalize ${cls[role] || ""}`}>{role}</Badge>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold  text-black">
        Creator Permissions
      </h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white" />
        <Input placeholder="Search creators..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-white">Name</TableHead>
              <TableHead className="text-white">Roles</TableHead>
              <TableHead className="text-white">Overrides</TableHead>
              <TableHead className="text-right text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow key={c.user_id}>
                <TableCell className="font-medium">{c.display_name}</TableCell>
                <TableCell><div className="flex gap-1">{c.roles.map(roleBadge)}</div></TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">—</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openUser(c)}>
                    <Shield className="h-3 w-3 mr-1" /> Permissions
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No creators found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Permissions: {selectedUser?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-3">
            Roles: {selectedUser?.roles.map((r: string) => r).join(", ")}. 
            Click to cycle: <Badge variant="outline" className="text-[9px] mx-0.5">Default</Badge> → 
            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 mx-0.5">Allow</Badge> → 
            <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive mx-0.5">Deny</Badge>
          </div>
          <div className="space-y-2">
            {ALL_PERMISSIONS.map(p => (
              <div key={p.key} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className={`text-xs h-7 min-w-[70px] ${
                    overrides[p.key] === true ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                    overrides[p.key] === false ? "bg-destructive/10 text-destructive border-destructive/30" :
                    ""
                  }`}
                  onClick={() => toggleOverride(p.key)}
                >
                  {overrides[p.key] === true ? "Allow" : overrides[p.key] === false ? "Deny" : "Default"}
                </Button>
              </div>
            ))}
          </div>
          <Button onClick={saveOverrides} className="w-full mt-4" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Permissions"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
