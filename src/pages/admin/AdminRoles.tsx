import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

interface Role { id: string; name: string; label: string; description: string | null; is_system: boolean; }
interface Permission { id?: string; role_id?: string; module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; }
interface AdminUserRole { id: string; user_id: string; admin_role_id: string; is_active: boolean; admin_role?: { label: string; name: string }; }

export default function AdminRoles() {
  const qc = useQueryClient();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("roles");
  const [roleDialog, setRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "", label: "", description: "" });
  const [permMatrix, setPermMatrix] = useState<Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ user_id: "", admin_role_id: "" });
  const { log } = useAdminLogger();

  const { data: roles = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => utils.admin.listAdminRoles.fetch() as Promise<Role[]>,
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ["role-permissions", selectedRoleId],
    queryFn: async () => {
      if (!selectedRoleId) return [];
      const rows = await utils.admin.listAdminRolePermissions.fetch({ roleId: selectedRoleId });
      const matrix = new Map<string, Permission>();
      rows.forEach((row) => {
        const [module, action] = row.permission_key.split(":");
        const current = matrix.get(module) || {
          module,
          can_view: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
        };
        if (action === "view") current.can_view = !!row.is_allowed;
        if (action === "create") current.can_create = !!row.is_allowed;
        if (action === "edit") current.can_edit = !!row.is_allowed;
        if (action === "delete") current.can_delete = !!row.is_allowed;
        matrix.set(module, current);
      });
      return Array.from(matrix.values());
    },
    enabled: !!selectedRoleId,
  });

  const { data: adminUsers = [] } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: () => utils.admin.listAdminUserRoles.fetch() as Promise<AdminUserRole[]>,
  });

  const getMatrix = () => {
    const m: typeof permMatrix = {};
    MODULES.forEach(mod => {
      const p = permissions.find(pp => pp.module === mod.key);
      m[mod.key] = { can_view: p?.can_view || false, can_create: p?.can_create || false, can_edit: p?.can_edit || false, can_delete: p?.can_delete || false };
    });
    return m;
  };

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      if (editingRole) {
        await utils.admin.upsertAdminRole.fetch({
          id: editingRole.id,
          label: roleForm.label,
          description: roleForm.description || null,
        });
        await log({ module: "roles", action: `Role updated: ${roleForm.label}`, actionType: "update", targetType: "admin_role", targetId: editingRole.id, riskLevel: "high" });
      } else {
        await utils.admin.upsertAdminRole.fetch({
          name: roleForm.name,
          label: roleForm.label,
          description: roleForm.description || null,
        });
        await log({ module: "roles", action: `Role created: ${roleForm.label}`, actionType: "create", targetType: "admin_role", riskLevel: "high" });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-roles"] }); setRoleDialog(false); toast({ title: "Role saved" }); },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const role = roles.find(r => r.id === id);
      await utils.admin.deleteAdminRole.fetch({ id });
      await log({ module: "roles", action: `Role deleted: ${role?.label || id}`, actionType: "delete", targetType: "admin_role", targetId: id, riskLevel: "critical" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-roles"] }); toast({ title: "Deleted" }); },
  });

  const savePermsMutation = useMutation({
    mutationFn: async (matrix: typeof permMatrix) => {
      if (!selectedRoleId) return;
      const modules = Object.entries(matrix).map(([module, p]) => ({ module, ...p }));
      await utils.admin.replaceAdminRolePermissions.fetch({ roleId: selectedRoleId, modules });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["role-permissions", selectedRoleId] }); toast({ title: "Permissions saved" }); },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      await utils.admin.assignAdminRoleToUser.fetch({
        user_id: assignForm.user_id,
        admin_role_id: assignForm.admin_role_id,
      });
      const role = roles.find(r => r.id === assignForm.admin_role_id);
      await log({ module: "roles", action: `Admin role assigned: ${role?.label || ""}`, actionType: "assign", targetType: "user", targetId: assignForm.user_id, riskLevel: "critical" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-user-roles"] }); setAssignDialog(false); toast({ title: "Role assigned" }); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await utils.admin.setAdminUserRoleActive.fetch({ id, is_active });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-user-roles"] }); },
  });

  const openNewRole = () => { setEditingRole(null); setRoleForm({ name: "", label: "", description: "" }); setRoleDialog(true); };
  const openEditRole = (r: Role) => { setEditingRole(r); setRoleForm({ name: r.name, label: r.label, description: r.description || "" }); setRoleDialog(true); };

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
                {roles.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />{r.label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{r.description || "—"}</TableCell>
                    <TableCell><Badge variant={r.is_system ? "default" : "secondary"}>{r.is_system ? "System" : "Custom"}</Badge></TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditRole(r)}><Pencil className="h-4 w-4" /></Button>
                      {!r.is_system && (
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteRoleMutation.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={selectedRoleId || ""} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="w-60"><SelectValue placeholder="Select a role" /></SelectTrigger>
              <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            {selectedRoleId && (
              <Button onClick={() => savePermsMutation.mutate(getMatrix())} disabled={savePermsMutation.isPending}>
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
                    {(() => {
                      const matrix = getMatrix();
                      return MODULES.map(mod => (
                        <TableRow key={mod.key}>
                          <TableCell className="font-medium">{mod.label}</TableCell>
                          {(["can_view", "can_create", "can_edit", "can_delete"] as const).map(action => (
                            <TableCell key={action} className="text-center">
                              <Checkbox
                                checked={matrix[mod.key]?.[action] || false}
                                onCheckedChange={v => {
                                  const updated = { ...matrix, [mod.key]: { ...matrix[mod.key], [action]: !!v } };
                                  savePermsMutation.mutate(updated);
                                }}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="admins" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setAssignForm({ user_id: "", admin_role_id: "" }); setAssignDialog(true); }}><Plus className="h-4 w-4 mr-2" />Assign Role</Button>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Toggle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No assignments. Unassigned admins operate as Super Admin.</TableCell></TableRow>
                ) : adminUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.user_id.slice(0, 8)}...</TableCell>
                    <TableCell><Badge>{u.admin_role?.label || "—"}</Badge></TableCell>
                    <TableCell><Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={u.is_active} onCheckedChange={v => toggleActiveMutation.mutate({ id: u.id, is_active: v })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRole ? "Edit Role" : "New Role"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!editingRole && <div><label className="text-sm font-medium">Name (Key)</label><Input value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. editor" /></div>}
            <div><label className="text-sm font-medium">Label</label><Input value={roleForm.label} onChange={e => setRoleForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Editor" /></div>
            <div><label className="text-sm font-medium">Description</label><Textarea rows={2} value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} /></div>
            <Button className="w-full" disabled={saveRoleMutation.isPending} onClick={() => saveRoleMutation.mutate()}>
              {saveRoleMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Role</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">User ID</label><Input value={assignForm.user_id} onChange={e => setAssignForm(f => ({ ...f, user_id: e.target.value }))} placeholder="UUID" /></div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={assignForm.admin_role_id} onValueChange={v => setAssignForm(f => ({ ...f, admin_role_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={assignMutation.isPending} onClick={() => assignMutation.mutate()}>
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
