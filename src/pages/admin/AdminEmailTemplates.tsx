import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Mail, Plus, Search, Edit, Eye, Trash2, FileText, ShoppingCart, CreditCard, Users, Key, Crown, Wallet } from "lucide-react";
import SummaryCard from '@/components/admin/SummaryCard';


interface EmailTemplate {
  id: string; name: string; template_type: string; subject: string;
  body_html: string; body_text: string; variables: string[]; status: string;
  created_at: string; updated_at: string;
}

const TYPE_LABELS: Record<string, { label: string; icon: any }> = {
  welcome: { label: "Welcome", icon: Users },
  email_verification: { label: "Email Verification", icon: Key },
  password_reset: { label: "Password Reset", icon: Key },
  order_confirmation: { label: "Order Confirmation", icon: ShoppingCart },
  payment_success: { label: "Payment Success", icon: CreditCard },
  payment_failed: { label: "Payment Failed", icon: CreditCard },
  creator_application_received: { label: "Application Received", icon: FileText },
  creator_approved: { label: "Application Approved", icon: Users },
  creator_rejected: { label: "Application Rejected", icon: Users },
  withdrawal_approved: { label: "Withdrawal Approved", icon: Wallet },
  withdrawal_rejected: { label: "Withdrawal Rejected", icon: Wallet },
  subscription_activated: { label: "Subscription Active", icon: Crown },
  subscription_expiry_reminder: { label: "Subscription Expiry", icon: Crown },
  admin_announcement: { label: "Admin Announcement", icon: Mail },
};

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState({ name: "", template_type: "", subject: "", body_html: "", body_text: "", status: "active" });

  const fetchTemplates = async () => {
    const { data } = await supabase.from("email_templates").select("*").order("created_at", { ascending: true });
    setTemplates((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openEdit = (t?: EmailTemplate) => {
    if (t) {
      setSelected(t);
      setForm({ name: t.name, template_type: t.template_type, subject: t.subject, body_html: t.body_html, body_text: t.body_text, status: t.status });
    } else {
      setSelected(null);
      setForm({ name: "", template_type: "", subject: "", body_html: "", body_text: "", status: "active" });
    }
    setEditOpen(true);
  };

  const saveTemplate = async () => {
    if (!form.name || !form.template_type || !form.subject) {
      return toast.error("Name, type, and subject are required");
    }
    const payload = { name: form.name, template_type: form.template_type, subject: form.subject, body_html: form.body_html, body_text: form.body_text, status: form.status };
    if (selected) {
      const { error } = await supabase.from("email_templates").update(payload).eq("id", selected.id);
      if (error) return toast.error(error.message);
      toast.success("Template updated");
    } else {
      const { error } = await supabase.from("email_templates").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Template created");
    }
    setEditOpen(false);
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await supabase.from("email_templates").delete().eq("id", id);
    toast.success("Template deleted");
    fetchTemplates();
  };

  const toggleStatus = async (t: EmailTemplate) => {
    const newStatus = t.status === "active" ? "inactive" : "active";
    await supabase.from("email_templates").update({ status: newStatus }).eq("id", t.id);
    toast.success(`Template ${newStatus === "active" ? "activated" : "deactivated"}`);
    fetchTemplates();
  };

  const filtered = templates.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.template_type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeCount = templates.filter((t) => t.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-black">Email Templates</h1>
        </div>
        <Button onClick={() => openEdit()} className="gap-2"><Plus className="h-4 w-4" /> New Template</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <SummaryCard
          icon={Mail}
          title={"Total Templates"}
          value={templates.length}
          color="#017B51"
        />
        
        <SummaryCard
          icon={FileText}
          title={"Active"}
          value={activeCount}
          color="#017B51"
        />
        
        <SummaryCard
          icon={FileText}
          title={"Inactive"}
          value={templates.length - activeCount}
          color="#017B51"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white" />
          <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className=" overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Variables</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-black">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-black">No templates found</TableCell></TableRow>
            ) : filtered.map((t) => {
              const typeInfo = TYPE_LABELS[t.template_type];
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs text-black">{typeInfo?.label || t.template_type}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.subject}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {t.variables?.slice(0, 3).map((v) => (<Badge key={v} variant="secondary" className="text-[10px]">{`{{${v}}}`}</Badge>))}
                      {(t.variables?.length || 0) > 3 && <Badge variant="secondary" className="text-[10px]">+{t.variables.length - 3}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell><Switch checked={t.status === "active"} onCheckedChange={() => toggleStatus(t)} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setSelected(t); setPreviewOpen(true); }}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteTemplate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">Template Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-sm font-medium mb-1 block">Type</label><Input value={form.template_type} onChange={(e) => setForm({ ...form, template_type: e.target.value })} placeholder="e.g. welcome, order_confirmation" /></div>
            </div>
            <div><label className="text-sm font-medium mb-1 block">Subject</label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div><label className="text-sm font-medium mb-1 block">HTML Body</label><Textarea value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })} rows={8} className="font-mono text-xs" /></div>
            <div><label className="text-sm font-medium mb-1 block">Text Body</label><Textarea value={form.body_text} onChange={(e) => setForm({ ...form, body_text: e.target.value })} rows={3} /></div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={saveTemplate}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Template Preview: {selected?.name}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline">{TYPE_LABELS[selected.template_type]?.label || selected.template_type}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={selected.status === "active" ? "default" : "secondary"}>{selected.status === "active" ? "Active" : "Inactive"}</Badge></div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Subject</p>
                <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">{selected.subject}</p>
              </div>
              {selected.variables?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Variables</p>
                  <div className="flex flex-wrap gap-1">{selected.variables.map((v) => <Badge key={v} variant="secondary">{`{{${v}}}`}</Badge>)}</div>
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-1">HTML Preview</p>
                <div className="border border-border/40 rounded-lg p-4 bg-white text-black" dangerouslySetInnerHTML={{ __html: selected.body_html }} />
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Text Version</p>
                <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded whitespace-pre-wrap">{selected.body_text}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
