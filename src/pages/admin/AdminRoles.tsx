import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Shield, Users, ShieldCheck } from "lucide-react";
import { useAdminLogger } from "@/hooks/useAdminLogger";
import { trpc } from "@/lib/trpc";

const MODULES = [
  { key: "books", label: "Books" }, { key: "users", label: "Users" },
  { key: "orders", label: "Orders" }, { key: "payments", label: "Payments" },
  { key: "reports", label: "Reports" }, { key: "support", label: "Support" },
  { key: "content", label: "Content" }, { key: "settings", label: "Settings" },
  { key: "roles", label: "Roles" }, { key: "email", label: "Email" },
  { key: "notifications", label: "Notifications" }, { key: "analytics", label: "Analytics" },
  { key: "cms", label: "CMS" }, { key: "subscriptions", label: "Subscriptions" },
  { key: "coupons", label: "Coupons" }, { key: "shipping", label: "Shipping" },
  { key: "withdrawals", label: "Withdrawals" }, { key: "revenue", label: "Revenue" },
];

type PermRow = { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };
type PermMatrix = Record<string, PermRow>;

interface Role { id: string; name: string; label: string; description: string | null; is_system: boolean; }
interface AdminUserRole {
  id: string;
  user_id: string;
  admin_role_id: string;
  is_active: boolean;
  admin_role?: { label: string; name: string };
  user_email?: string | null;
  user_name?: string | null;
}

function emptyMatrix(): PermMatrix {
  const m: PermMatrix = {};
  MODULES.forEach(mod => { m[mod.key] = { can_view: false, can_create: false, can_edit: false, can_delete: false }; });
  return m;
}

export default function AdminRoles() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("roles");
  const [roleDialog, setRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", label: "", description: "" });
  const [permMatrix, setPermMatrix] = useState<PermMatrix>(emptyMatrix);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ user_id: "", admin_role_id: "" });
  const { log } = useAdminLogger();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: roles = [] } = trpc.admin.listAdminRoles.useQuery();

  const { data: rolePermissions = [] } = trpc.admin.listAdminRolePermissions.useQuery(
    { roleId: selectedRoleId! },
    { enabled: !!selectedRoleId }
  );

  const { data: adminUsers = [] } = trpc.admin.listAdminUserRoles.useQuery();

  // Rebuild local matrix whenever the fetched permissions change
  useEffect(() => {
    const m = emptyMatrix();
    rolePermissions.forEach((row) => {
      const [module, action] = row.permission_key.split(":");
      if (m[module]) {
        if (action === "view")   m[module].can_view   = !!row.is_allowed;
        if (action === "create") m[module].can_create = !!row.is_allowed;
        if (action === "edit")   m[module].can_edit   = !!row.is_allowed;
        if (action === "delete") m[module].can_delete = !!row.is_allowed;
      }
    });
    setPermMatrix(m);
  }, [rolePermissions]);

  // Reset matrix when role selection changes
  useEffect(() => {
    if (!selectedRoleId) setPermMatrix(emptyMatrix());
  }, [selectedRoleId]);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const saveRoleMutation = trpc.admin.upsertAdminRole.useMutation({
    onSuccess: async () => {
      await utils.admin.listAdminRoles.invalidate();
      const label = roleForm.label;
      const editing = editingRole;
      setRoleDialog(false);
      toast({ title: "Role saved" });
      if (editing) {
        log({ module: "roles", action: `Role updated: ${label}`, actionType: "update", targetType: "admin_role", targetId: editing.id, riskLevel: "high" });
      } else {
        log({ module: "roles", action: `Role created: ${label}`, actionType: "create", targetType: "admin_role", riskLevel: "high" });
      }
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRoleMutation = trpc.admin.deleteAdminRole.useMutation({
    onSuccess: async () => {
      await utils.admin.listAdminRoles.invalidate();
      toast({ title: "Deleted" });
    },
    onError: (err) => toast({ title: "Cannot delete", description: err.message, variant: "destructive" }),
  });

  const savePermsMutation = trpc.admin.replaceAdminRolePermissions.useMutation({
    onSuccess: async () => {
      if (selectedRoleId) await utils.admin.listAdminRolePermissions.invalidate({ roleId: selectedRoleId });
      toast({ title: "Permissions saved" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const assignMutation = trpc.admin.assignAdminRoleToUser.useMutation({
    onSuccess: async () => {
      await utils.admin.listAdminUserRoles.invalidate();
      const { user_id, admin_role_id } = assignForm;
      setAssignDialog(false);
      toast({ title: "Role assigned" });
      const role = (roles as Role[]).find(r => r.id === admin_role_id);
      log({ module: "roles", action: `Admin role assigned: ${role?.label || ""}`, actionType: "assign", targetType: "user", targetId: user_id, riskLevel: "critical" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleActiveMutation = trpc.admin.setAdminUserRoleActive.useMutation({
    onSuccess: () => utils.admin.listAdminUserRoles.invalidate(),
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const openNewRole = () => {
    setEditingRole(null);
    setRoleForm({ name: "", label: "", description: "" });
    setRoleDialog(true);
  };

  const openEditRole = (r: Role) => {
    setEditingRole(r);
    setRoleForm({ name: r.name, label: r.label, description: r.description || "" });
    setRoleDialog(true);
  };

  const handleSaveRole = () => {
    if (editingRole) {
      saveRoleMutation.mutate({ id: editingRole.id, label: roleForm.label, description: roleForm.description || null });
    } else {
      saveRoleMutation.mutate({ name: roleForm.name, label: roleForm.label, description: roleForm.description || null });
    }
  };

  const handleDeleteRole = (r: Role) => {
    if (!confirm(`Delete role "${r.label}"?`)) return;
    deleteRoleMutation.mutate({ id: r.id }, {
      onSuccess: () => log({ module: "roles", action: `Role deleted: ${r.label}`, actionType: "delete", targetType: "admin_role", targetId: r.id, riskLevel: "critical" }),
    });
  };

  const handleSavePerms = () => {
    if (!selectedRoleId) return;
    const modules = Object.entries(permMatrix).map(([module, p]) => ({ module, ...p }));
    savePermsMutation.mutate({ roleId: selectedRoleId, modules });
  };

  const togglePerm = (modKey: string, action: keyof PermRow, value: boolean) => {
    setPermMatrix(prev => ({ ...prev, [modKey]: { ...prev[modKey], [action]: value } }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-primary">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground">Admin roles, permissions & user management</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="roles" className="gap-1"><Shield className="h-3.5 w-3.5" />Roles</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1"><ShieldCheck className="h-3.5 w-3.5" />Permission Matrix</TabsTrigger>
          <TabsTrigger value="admins" className="gap-1"><Users className="h-3.5 w-3.5" />Admin Users</TabsTrigger>
        </TabsList>

        {/* ── Roles Tab ── */}
        <TabsContent value="roles" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNewRole}><Plus className="h-4 w-4 mr-2" />New Role</Button>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Name (Key)</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No roles defined.</TableCell></TableRow>
                )}
                {(roles as Role[]).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />{r.label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{r.description || "—"}</TableCell>
                    <TableCell><Badge variant={r.is_system ? "default" : "secondary"}>{r.is_system ? "System" : "Custom"}</Badge></TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditRole(r)}><Pencil className="h-4 w-4" /></Button>
                      {!r.is_system && (
                        <Button size="icon" variant="ghost" className="text-destructive" disabled={deleteRoleMutation.isPending} onClick={() => handleDeleteRole(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Permission Matrix Tab ── */}
        <TabsContent value="permissions" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={selectedRoleId || ""} onValueChange={v => setSelectedRoleId(v || null)}>
              <SelectTrigger className="w-60"><SelectValue placeholder="Select a role" /></SelectTrigger>
              <SelectContent>{(roles as Role[]).map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            {selectedRoleId && (
              <Button onClick={handleSavePerms} disabled={savePermsMutation.isPending}>
                {savePermsMutation.isPending ? "Saving..." : "Save Permissions"}
              </Button>
            )}
          </div>

          {selectedRoleId && (
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-0 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Module</TableHead>
                      <TableHead className="text-center w-24">View</TableHead>
                      <TableHead className="text-center w-24">Create</TableHead>
                      <TableHead className="text-center w-24">Edit</TableHead>
                      <TableHead className="text-center w-24">Delete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MODULES.map(mod => (
                      <TableRow key={mod.key}>
                        <TableCell className="font-medium">{mod.label}</TableCell>
                        {(["can_view", "can_create", "can_edit", "can_delete"] as const).map(action => (
                          <TableCell key={action} className="text-center">
                            <Checkbox
                              checked={permMatrix[mod.key]?.[action] || false}
                              onCheckedChange={v => togglePerm(mod.key, action, !!v)}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Admin Users Tab ── */}
        <TabsContent value="admins" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setAssignForm({ user_id: "", admin_role_id: "" }); setAssignDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />Assign Role
            </Button>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No assignments. Unassigned admins operate as Super Admin.</TableCell></TableRow>
                ) : (adminUsers as AdminUserRole[]).map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{u.user_name || u.user_email || "—"}</div>
                      {u.user_email && u.user_name && (
                        <div className="text-xs text-muted-foreground">{u.user_email}</div>
                      )}
                      {!u.user_name && !u.user_email && (
                        <div className="font-mono text-xs text-muted-foreground">{u.user_id.slice(0, 8)}…</div>
                      )}
                    </TableCell>
                    <TableCell><Badge>{u.admin_role?.label || "—"}</Badge></TableCell>
                    <TableCell><Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell>
                      <Switch
                        checked={u.is_active}
                        disabled={toggleActiveMutation.isPending}
                        onCheckedChange={v => toggleActiveMutation.mutate({ id: u.id, is_active: v })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Role Dialog ── */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRole ? "Edit Role" : "New Role"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!editingRole && (
              <div>
                <label className="text-sm font-medium">Name (Key)</label>
                <Input value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. editor" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Label</label>
              <Input value={roleForm.label} onChange={e => setRoleForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Editor" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea rows={2} value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <Button className="w-full" disabled={saveRoleMutation.isPending} onClick={handleSaveRole}>
              {saveRoleMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Role Dialog ── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Role</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">User ID</label>
              <Input value={assignForm.user_id} onChange={e => setAssignForm(f => ({ ...f, user_id: e.target.value }))} placeholder="UUID" />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={assignForm.admin_role_id} onValueChange={v => setAssignForm(f => ({ ...f, admin_role_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>{(roles as Role[]).map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={assignMutation.isPending} onClick={() => assignMutation.mutate(assignForm)}>
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
