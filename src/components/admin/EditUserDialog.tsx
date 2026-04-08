import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Save } from "lucide-react";
import { toast } from "sonner";

const ALL_ROLES = ["user", "admin", "writer", "publisher", "narrator", "moderator", "rj"] as const;

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    user_id: string;
    display_name: string | null;
    full_name: string | null;
    email?: string;
    roles: string[];
    is_active: boolean;
  } | null;
  onSaved: () => void;
}

export function EditUserDialog({ open, onOpenChange, user, onSaved }: EditUserDialogProps) {
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || user.full_name || "");
      setEmail(user.email || "");
      setIsActive(user.is_active);
      setSelectedRoles(new Set(user.roles));
    }
  }, [user]);

  const toggleRole = (role: string) => {
    const next = new Set(selectedRoles);
    if (next.has(role)) {
      if (role === "user") return; // can't remove base user role
      next.delete(role);
    } else {
      next.add(role);
    }
    setSelectedRoles(next);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!displayName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Valid email is required");
      return;
    }

    setSaving(true);
    try {
      // 1. Update profile via admin RPC (bypasses CLS restrictions)
      const { error: profileErr } = await supabase.rpc("admin_update_profile" as any, {
        p_user_id: user.user_id,
        p_display_name: displayName.trim(),
        p_is_active: isActive,
      });
      if (profileErr) throw new Error(profileErr.message);

      // 2. Update email via edge function if changed
      if (email.trim() !== user.email) {
        const res = await supabase.functions.invoke("admin-manage-user", {
          body: { action: "update_email", userId: user.user_id, newEmail: email.trim() },
        });
        if (res.error) {
          // Try to parse the error body for a message
          let msg = "Failed to update email";
          try {
            const body = typeof res.error === "object" && "context" in res.error
              ? await (res.error as any).context?.json?.()
              : null;
            if (body?.error) msg = body.error;
          } catch {}
          throw new Error(msg);
        }
        if (res.data?.error) throw new Error(res.data.error);
      }

      // 3. Sync roles — delete removed, insert added
      const currentRoles = new Set(user.roles);
      const newRoles = selectedRoles;

      const toRemove = [...currentRoles].filter(r => !newRoles.has(r));
      const toAdd = [...newRoles].filter(r => !currentRoles.has(r));

      for (const role of toRemove) {
        await supabase.from("user_roles").delete().eq("user_id", user.user_id).eq("role", role as any);
      }
      for (const role of toAdd) {
        await supabase.from("user_roles").insert({ user_id: user.user_id, role: role as any });
      }

      // 4. Audit log
      const changes: string[] = [];
      if (displayName.trim() !== (user.display_name || "")) changes.push(`name → ${displayName.trim()}`);
      if (email.trim() !== user.email) changes.push(`email → ${email.trim()}`);
      if (isActive !== user.is_active) changes.push(`status → ${isActive ? "active" : "inactive"}`);
      if (toAdd.length || toRemove.length) changes.push(`roles: +${toAdd.join(",")} -${toRemove.join(",")}`);

      if (changes.length) {
        await supabase.from("admin_activity_logs").insert({
          user_id: (await supabase.auth.getUser()).data.user?.id || "",
          action: "User edited",
          details: changes.join("; "),
          target_type: "user",
          target_id: user.user_id,
          module: "users",
          risk_level: toAdd.includes("admin") || toRemove.includes("admin") ? "high" : "medium",
        });
      }

      toast.success("User updated successfully");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
    setSaving(false);
  };

  const roleLabels: Record<string, string> = {
    user: "Reader",
    admin: "Admin",
    writer: "Writer",
    publisher: "Publisher",
    narrator: "Narrator",
    moderator: "Moderator",
    rj: "Radio Jockey",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Edit User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Display Name</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={100} />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255} />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map(role => (
                <label key={role} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-secondary/50">
                  <Checkbox
                    checked={selectedRoles.has(role)}
                    onCheckedChange={() => toggleRole(role)}
                    disabled={role === "user"}
                  />
                  <span className="capitalize">{roleLabels[role]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm">Active Status</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
