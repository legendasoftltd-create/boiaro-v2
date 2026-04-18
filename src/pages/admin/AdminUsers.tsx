import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Search, Eye, Shield, UserCheck, UserX, Pencil, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeactivateModal } from "@/components/admin/DeactivateModal";
import { EditUserDialog } from "@/components/admin/EditUserDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface UserRow {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  created_at: string;
  is_active: boolean;
  deleted_at: string | null;
  deleted_reason: string | null;
  email?: string;
  roles: string[];
  order_count: number;
  has_active_sub: boolean;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterSub, setFilterSub] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState("active");

  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('admin-profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { loadUsers(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => { loadUsers(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data: profiles, error: profilesError } = await supabase.rpc("admin_get_all_profiles");
    if (profilesError) {
      console.error("Failed to load profiles:", profilesError.message);
      toast.error("Failed to load users: " + profilesError.message);
      setLoading(false);
      return;
    }

    if (!profiles?.length) { setUsers([]); setLoading(false); return; }
    const userIds = profiles.map((p: any) => p.user_id);

    const [rolesRes, ordersRes, subsRes, authRes] = await Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("orders").select("user_id", { count: "exact" }),
      supabase.from("user_subscriptions" as any).select("user_id, status").eq("status", "active"),
      supabase.functions.invoke("admin-manage-user", {
        body: { action: "list_users_meta", userIds },
      }),
    ]);

    const roleMap: Record<string, string[]> = {};
    (rolesRes.data || []).forEach((r: any) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });
    const orderMap: Record<string, number> = {};
    (ordersRes.data || []).forEach((o: any) => {
      orderMap[o.user_id] = (orderMap[o.user_id] || 0) + 1;
    });
    const subSet = new Set<string>();
    ((subsRes.data as any[]) || []).forEach((s: any) => subSet.add(s.user_id));
    const authMap: Record<string, any> = {};
    if (authRes.data?.users) {
      authRes.data.users.forEach((u: any) => { authMap[u.id] = u; });
    }

    const rows: UserRow[] = profiles.map((p: any) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      phone: p.phone,
      bio: p.bio,
      created_at: p.created_at,
      is_active: p.is_active !== false,
      deleted_at: p.deleted_at || null,
      deleted_reason: p.deleted_reason || null,
      email: authMap[p.user_id]?.email || "",
      roles: roleMap[p.user_id] || ["user"],
      order_count: orderMap[p.user_id] || 0,
      has_active_sub: subSet.has(p.user_id),
      last_sign_in_at: authMap[p.user_id]?.last_sign_in_at,
      email_confirmed_at: authMap[p.user_id]?.email_confirmed_at,
    }));

    setUsers(rows);
    setLoading(false);
  };

  const activeUsers = users.filter(u => !u.deleted_at);
  const deletedUsers = users.filter(u => !!u.deleted_at);

  const applyFilters = (list: UserRow[]) => list.filter((u) => {
    if (filterRole !== "all" && !u.roles.includes(filterRole)) return false;
    if (filterSub === "active" && !u.has_active_sub) return false;
    if (filterSub === "none" && u.has_active_sub) return false;
    if (search) {
      const s = search.toLowerCase();
      const nameMatch = (u.display_name || "").toLowerCase().includes(s) || (u.full_name || "").toLowerCase().includes(s);
      const emailMatch = (u.email || "").toLowerCase().includes(s);
      const phoneMatch = (u.phone || "").toLowerCase().includes(s);
      if (!nameMatch && !emailMatch && !phoneMatch) return false;
    }
    return true;
  });

  const filtered = applyFilters(tab === "active" ? activeUsers : deletedUsers);

  const stats = {
    total: activeUsers.length,
    creators: activeUsers.filter((u) => u.roles.some((r) => ["writer", "publisher", "narrator"].includes(r))).length,
    verified: activeUsers.filter((u) => u.email_confirmed_at).length,
    deleted: deletedUsers.length,
  };

  const roleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-500/20 text-red-400",
      writer: "bg-blue-500/20 text-blue-400",
      publisher: "bg-purple-500/20 text-purple-400",
      narrator: "bg-emerald-500/20 text-emerald-400",
      moderator: "bg-amber-500/20 text-amber-400",
      user: "bg-muted text-muted-foreground",
    };
    return colors[role] || colors.user;
  };

  const handleToggleUser = (u: UserRow) => {
    if (u.is_active) {
      setDeactivateTarget(u);
    } else {
      activateUser(u);
    }
  };

  const activateUser = async (u: UserRow) => {
    const { error } = await supabase.rpc("admin_update_profile" as any, {
      p_user_id: u.user_id,
      p_is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, is_active: true } : x));
    toast.success("User activated");
  };

  const deactivateUser = async (u: UserRow, reason: string, type: string) => {
    const { error } = await supabase.rpc("admin_update_profile" as any, {
      p_user_id: u.user_id,
      p_is_active: false,
    });
    if (error) { toast.error(error.message); return; }
    await supabase.from("admin_activity_logs").insert({
      user_id: (await supabase.auth.getUser()).data.user?.id || "",
      action: `User deactivated (${type})`,
      details: reason || "No reason provided",
      target_type: "user",
      target_id: u.user_id,
      module: "users",
      risk_level: type === "permanent" ? "high" : "medium",
    });
    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, is_active: false } : x));
    setDeactivateTarget(null);
    toast.success("User deactivated");
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("admin_soft_delete_user" as any, {
        p_user_id: deleteTarget.user_id,
        p_reason: deleteReason.trim() || null,
      });
      if (error) throw new Error(error.message);

      await supabase.from("admin_activity_logs").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id || "",
        action: "User soft-deleted",
        details: deleteReason.trim() || "No reason provided",
        target_type: "user",
        target_id: deleteTarget.user_id,
        module: "users",
        risk_level: "high",
      });

      toast.success("User moved to deleted list");
      setDeleteTarget(null);
      setDeleteReason("");
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
    setDeleting(false);
  };

  const handleRestore = async (u: UserRow) => {
    if (!confirm(`Restore ${u.display_name || u.full_name || "this user"}?`)) return;
    try {
      const { error } = await supabase.rpc("admin_restore_user" as any, {
        p_user_id: u.user_id,
      });
      if (error) throw new Error(error.message);

      await supabase.from("admin_activity_logs").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id || "",
        action: "User restored",
        details: `Restored from soft-delete`,
        target_type: "user",
        target_id: u.user_id,
        module: "users",
        risk_level: "high",
      });

      toast.success("User restored successfully");
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to restore user");
    }
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(u => u.user_id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const bulkSetActive = async (active: boolean) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`${active ? "Activate" : "Deactivate"} ${ids.length} user(s)?`)) return;
    for (const id of ids) {
      await supabase.rpc("admin_update_profile" as any, { p_user_id: id, p_is_active: active });
    }
    await supabase.from("admin_activity_logs").insert({
      user_id: (await supabase.auth.getUser()).data.user?.id || "",
      action: `Bulk ${active ? "activate" : "deactivate"} ${ids.length} users`,
      module: "users",
      risk_level: "high",
    });
    setUsers(prev => prev.map(x => ids.includes(x.user_id) ? { ...x, is_active: active } : x));
    setSelected(new Set());
    toast.success(`${ids.length} user(s) ${active ? "activated" : "deactivated"}`);
  };

  const renderUserTable = (list: UserRow[], isDeletedTab: boolean) => (
    <Card className="border-border/30">
      <Table>
        <TableHeader>
          <TableRow>
            {!isDeletedTab && (
              <TableHead className="w-10">
                <Checkbox checked={list.length > 0 && selected.size === list.length} onCheckedChange={toggleSelectAll} />
              </TableHead>
            )}
            <TableHead>User</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            {isDeletedTab ? (
              <>
                <TableHead>Deleted On</TableHead>
                <TableHead>Reason</TableHead>
              </>
            ) : (
              <>
                <TableHead>Status</TableHead>
                <TableHead>Verified</TableHead>
              </>
            )}
            <TableHead>Orders</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={isDeletedTab ? 8 : 10} className="text-center py-12">
                <div className="animate-spin h-6 w-6 border-3 border-primary border-t-transparent rounded-full mx-auto" />
              </TableCell>
            </TableRow>
          ) : list.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isDeletedTab ? 8 : 10} className="text-center py-12 text-muted-foreground">
                {isDeletedTab ? "No deleted users" : "No users found"}
              </TableCell>
            </TableRow>
          ) : (
            list.map((u) => (
              <TableRow key={u.user_id} className="cursor-pointer" onClick={() => navigate(`/admin/user/user/${u.user_id}`)}>
                {!isDeletedTab && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(u.user_id)} onCheckedChange={() => toggleSelect(u.user_id)} />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8 border border-border/40">
                      <AvatarImage src={u.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-serif">
                        {(u.display_name || u.full_name || "U")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate max-w-[140px]">{u.display_name || u.full_name || "—"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground max-w-[160px] truncate">{u.email || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.map((r) => (
                      <Badge key={r} className={`text-[10px] capitalize ${roleColor(r)}`}>{r}</Badge>
                    ))}
                  </div>
                </TableCell>
                {isDeletedTab ? (
                  <>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {u.deleted_at ? new Date(u.deleted_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground max-w-[160px] truncate">
                      {u.deleted_reason || "—"}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Switch checked={u.is_active} onCheckedChange={() => handleToggleUser(u)} />
                        <StatusBadge status={u.is_active ? "active" : "inactive"} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.email_confirmed_at ? (
                        <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400">✓</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-red-500/20 text-red-400"><UserX className="w-3 h-3" /></Badge>
                      )}
                    </TableCell>
                  </>
                )}
                <TableCell className="text-[13px]">{u.order_count}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {isDeletedTab ? (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => handleRestore(u)}>
                        <RotateCcw className="w-3.5 h-3.5" /> Restore
                      </Button>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditTarget(u)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setDeleteTarget(u); setDeleteReason(""); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(`/admin/user/user/${u.user_id}`)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">Manage all users</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Users", value: stats.total, icon: Users, color: "text-primary" },
          { label: "Creators", value: stats.creators, icon: UserCheck, color: "text-blue-400" },
          { label: "Verified", value: stats.verified, icon: Shield, color: "text-emerald-400" },
          { label: "Deleted", value: stats.deleted, icon: Trash2, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label} className="border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-secondary/60">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : s.value}</p>
                <p className="text-[12px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelected(new Set()); }}>
        <TabsList>
          <TabsTrigger value="active">Active Users ({activeUsers.length})</TabsTrigger>
          <TabsTrigger value="deleted">Deleted Users ({deletedUsers.length})</TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap gap-3 items-center mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name, email or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="user">Reader</SelectItem>
              <SelectItem value="writer">Writer</SelectItem>
              <SelectItem value="publisher">Publisher</SelectItem>
              <SelectItem value="narrator">Narrator</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          {tab === "active" && (
            <Select value={filterSub} onValueChange={setFilterSub}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Subscription" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Subscribed</SelectItem>
                <SelectItem value="none">No Subscription</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {tab === "active" && selected.size > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/40 mt-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => bulkSetActive(true)}>Activate All</Button>
            <Button size="sm" variant="destructive" onClick={() => bulkSetActive(false)}>Deactivate All</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        <TabsContent value="active">
          {renderUserTable(filtered, false)}
        </TabsContent>
        <TabsContent value="deleted">
          {renderUserTable(filtered, true)}
        </TabsContent>
      </Tabs>

      <DeactivateModal
        open={!!deactivateTarget}
        onOpenChange={(o) => { if (!o) setDeactivateTarget(null); }}
        itemName={deactivateTarget?.display_name || deactivateTarget?.full_name || "User"}
        onConfirm={(reason, type) => deactivateTarget && deactivateUser(deactivateTarget, reason, type)}
      />

      <EditUserDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        user={editTarget}
        onSaved={loadUsers}
      />

      {/* Soft Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will soft-delete <strong>{deleteTarget?.display_name || deleteTarget?.full_name || "this user"}</strong>. 
            They will be unable to log in but all their data (orders, earnings, roles) will remain intact. 
            You can restore them later from the Deleted Users tab.
          </p>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
            <Textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Why is this user being deleted?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleSoftDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
