import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
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
  const utils = trpc.useUtils();

  const { data, isLoading: loading } = trpc.admin.listUsers.useQuery({
    limit: 500,
    search: search || undefined,
  });
  const { data: statsData, isLoading: statsLoading } = trpc.admin.getUserStats.useQuery();
  const updateUserStatusMutation = trpc.admin.updateUserStatus.useMutation();
  const softDeleteUserMutation = trpc.admin.softDeleteUser.useMutation();
  const restoreUserMutation = trpc.admin.restoreUser.useMutation();
  const updateUserBasicMutation = trpc.admin.updateUserBasic.useMutation();
  const updateUserRoleMutation = trpc.admin.updateUserRole.useMutation();
  const logActionMutation = trpc.admin.logAction.useMutation();

  useEffect(() => {
    const rows: UserRow[] = (data?.users ?? []).map((user: any) => ({
      user_id: user.id,
      display_name: user.profile?.display_name ?? null,
      full_name: null,
      avatar_url: user.profile?.avatar_url ?? null,
      phone: null,
      bio: null,
      created_at: user.created_at,
      is_active: user.profile?.is_active !== false,
      deleted_at: user.profile?.deleted_at ?? null,
      deleted_reason: null,
      email: user.email ?? "",
      roles: user.roles?.map((role: any) => role.role) ?? ["user"],
      order_count: user.order_count ?? 0,
      has_active_sub: !!user.has_active_sub,
      email_confirmed_at: user.email_verified ? user.created_at : undefined,
    }));
    setUsers(rows);
  }, [data]);

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

  const stats = statsData ?? {
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
    try {
      await updateUserStatusMutation.mutateAsync({ userId: u.user_id, isActive: true });
      await logActionMutation.mutateAsync({
        action: "User activated",
        details: `Activated ${u.display_name || u.email || u.user_id}`,
        targetType: "user",
        targetId: u.user_id,
        module: "users",
        riskLevel: "medium",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to activate user");
      return;
    }
    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, is_active: true } : x));
    await utils.admin.getUserStats.invalidate();
    toast.success("User activated");
  };

  const deactivateUser = async (u: UserRow, reason: string, type: string) => {
    try {
      await updateUserStatusMutation.mutateAsync({ userId: u.user_id, isActive: false });
      await logActionMutation.mutateAsync({
        action: `User deactivated (${type})`,
        details: reason || "No reason provided",
        targetType: "user",
        targetId: u.user_id,
        module: "users",
        riskLevel: type === "permanent" ? "high" : "medium",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate user");
      return;
    }
    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, is_active: false } : x));
    await utils.admin.getUserStats.invalidate();
    setDeactivateTarget(null);
    toast.success("User deactivated");
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteUserMutation.mutateAsync({
        userId: deleteTarget.user_id,
        reason: deleteReason.trim() || undefined,
      });

      await logActionMutation.mutateAsync({
        action: "User soft-deleted",
        details: deleteReason.trim() || "No reason provided",
        targetType: "user",
        targetId: deleteTarget.user_id,
        module: "users",
        riskLevel: "high",
      });

      toast.success("User moved to deleted list");
      setDeleteTarget(null);
      setDeleteReason("");
      await utils.admin.getUserStats.invalidate();
      await utils.admin.listUsers.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
    setDeleting(false);
  };

  const handleRestore = async (u: UserRow) => {
    if (!confirm(`Restore ${u.display_name || u.full_name || "this user"}?`)) return;
    try {
      await restoreUserMutation.mutateAsync({ userId: u.user_id });
      await logActionMutation.mutateAsync({
        action: "User restored",
        details: `Restored from soft-delete`,
        targetType: "user",
        targetId: u.user_id,
        module: "users",
        riskLevel: "high",
      });

      toast.success("User restored successfully");
      await utils.admin.getUserStats.invalidate();
      await utils.admin.listUsers.invalidate();
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
    for (const id of ids) await updateUserStatusMutation.mutateAsync({ userId: id, isActive: active });
    await logActionMutation.mutateAsync({
      action: `Bulk ${active ? "activate" : "deactivate"} ${ids.length} users`,
      module: "users",
      riskLevel: "high",
    });
    setUsers(prev => prev.map(x => ids.includes(x.user_id) ? { ...x, is_active: active } : x));
    await utils.admin.getUserStats.invalidate();
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
                <p className="text-2xl font-bold">{statsLoading ? "—" : s.value}</p>
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
        onSaved={async ({ userId, displayName, email, isActive, roles }) => {
          if (!editTarget) return;
          const previousRoleSet = new Set(editTarget.roles);
          const nextRoleSet = new Set(roles);
          const toRemove = [...previousRoleSet].filter((role) => !nextRoleSet.has(role) && role !== "user");
          const toAdd = [...nextRoleSet].filter((role) => !previousRoleSet.has(role));

          await updateUserBasicMutation.mutateAsync({ userId, displayName, email });
          await updateUserStatusMutation.mutateAsync({ userId, isActive });
          for (const role of toRemove) {
            await updateUserRoleMutation.mutateAsync({ userId, role, action: "remove" });
          }
          for (const role of toAdd) {
            await updateUserRoleMutation.mutateAsync({ userId, role, action: "add" });
          }

          await logActionMutation.mutateAsync({
            action: "User edited",
            details: `Edited user ${displayName}`,
            targetType: "user",
            targetId: userId,
            module: "users",
            riskLevel: toAdd.includes("admin") || toRemove.includes("admin") ? "high" : "medium",
          });
          await utils.admin.getUserStats.invalidate();
          await utils.admin.listUsers.invalidate();
        }}
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
