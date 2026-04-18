import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bell, Plus, Send, Search, Trash2, Edit, Eye, Clock, ShoppingCart, CreditCard, Users, Megaphone, Calendar } from "lucide-react";

interface Notification {
  id: string; title: string; message: string; type: string; audience: string;
  target_user_id: string | null; priority: string; status: string; link: string | null;
  channel: string; scheduled_at: string | null; created_at: string; sent_at: string | null;
  created_by: string | null;
}

interface Template {
  id: string; name: string; title: string; message: string; type: string;
  channel: string; cta_text: string | null; cta_link: string | null; status: string;
  created_at: string;
}

const TYPES = [
  { value: "system", label: "System", icon: Bell },
  { value: "order", label: "Order", icon: ShoppingCart },
  { value: "payment", label: "Payment", icon: CreditCard },
  { value: "creator", label: "Creator", icon: Users },
  { value: "promotional", label: "Promotional", icon: Megaphone },
];

const AUDIENCES = [
  { value: "all", label: "All Users" },
  { value: "user", label: "All Readers" },
  { value: "writer", label: "All Writers" },
  { value: "publisher", label: "All Publishers" },
  { value: "narrator", label: "All Narrators" },
  { value: "admin", label: "All Admins" },
  { value: "specific", label: "Specific User" },
];

const CHANNELS = [
  { value: "in_app", label: "In-App" },
  { value: "email", label: "Email" },
  { value: "push", label: "Push" },
  { value: "multi", label: "Multi-Channel" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function AdminNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialog, setViewDialog] = useState<Notification | null>(null);
  const [editing, setEditing] = useState<Notification | null>(null);
  const [tab, setTab] = useState("all");
  const [tplDialog, setTplDialog] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [tplForm, setTplForm] = useState({ name: "", title: "", message: "", type: "system", channel: "in_app", cta_text: "", cta_link: "" });
  const [form, setForm] = useState({ title: "", message: "", type: "system", audience: "all", target_user_id: "", priority: "normal", link: "", channel: "in_app", scheduled_at: "" });

  const load = async () => {
    const [{ data: n }, { data: t }] = await Promise.all([
      supabase.from("notifications" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("notification_templates" as any).select("*").order("created_at", { ascending: false }),
    ]);
    setNotifications((n as any) || []);
    setTemplates((t as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ title: "", message: "", type: "system", audience: "all", target_user_id: "", priority: "normal", link: "", channel: "in_app", scheduled_at: "" }); setEditing(null); };
  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (n: Notification) => {
    setEditing(n);
    setForm({ title: n.title, message: n.message, type: n.type, audience: n.audience, target_user_id: n.target_user_id || "", priority: n.priority, link: n.link || "", channel: n.channel || "in_app", scheduled_at: n.scheduled_at ? n.scheduled_at.slice(0, 16) : "" });
    setDialogOpen(true);
  };
  const useTemplate = (t: Template) => {
    setForm({ title: t.title, message: t.message, type: t.type, audience: "all", target_user_id: "", priority: "normal", link: t.cta_link || "", channel: t.channel, scheduled_at: "" });
    setDialogOpen(true); setEditing(null);
  };

  const saveNotification = async () => {
    if (!form.title || !form.message) return toast.error("Title and message are required");
    const payload: any = {
      title: form.title, message: form.message, type: form.type, audience: form.audience, priority: form.priority,
      link: form.link || null, channel: form.channel,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      target_user_id: form.audience === "specific" ? form.target_user_id || null : null,
      created_by: user?.id || null, status: form.scheduled_at ? "scheduled" : "draft",
    };
    if (editing) {
      const { error } = await supabase.from("notifications" as any).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Notification updated");
    } else {
      const { error } = await supabase.from("notifications" as any).insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Notification created");
    }
    setDialogOpen(false); resetForm(); load();
  };

  const sendNotification = async (n: Notification) => {
    let userIds: string[] = [];
    if (n.audience === "specific" && n.target_user_id) {
      userIds = [n.target_user_id];
    } else {
      let query = supabase.from("user_roles").select("user_id") as any;
      if (n.audience !== "all") query = query.eq("role", n.audience);
      const { data } = await query;
      userIds = Array.from(new Set((data || []).map((r: any) => r.user_id as string)));
    }
    if (userIds.length === 0) return toast.error("No recipients found");
    const records = userIds.map((uid) => ({ user_id: uid, notification_id: n.id }));
    const { error: insertError } = await supabase.from("user_notifications" as any).insert(records);
    if (insertError) return toast.error(insertError.message);
    await supabase.from("notifications" as any).update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", n.id);
    toast.success(`Notification sent to ${userIds.length} user(s)`);
    load();
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications" as any).delete().eq("id", id);
    toast.success("Deleted"); load();
  };

  const openCreateTpl = () => { setTplForm({ name: "", title: "", message: "", type: "system", channel: "in_app", cta_text: "", cta_link: "" }); setEditingTpl(null); setTplDialog(true); };
  const openEditTpl = (t: Template) => { setEditingTpl(t); setTplForm({ name: t.name, title: t.title, message: t.message, type: t.type, channel: t.channel, cta_text: t.cta_text || "", cta_link: t.cta_link || "" }); setTplDialog(true); };
  const saveTpl = async () => {
    if (!tplForm.name || !tplForm.title) return toast.error("Name and title are required");
    const payload: any = { ...tplForm, cta_text: tplForm.cta_text || null, cta_link: tplForm.cta_link || null };
    if (editingTpl) { await supabase.from("notification_templates" as any).update(payload).eq("id", editingTpl.id); toast.success("Template updated"); }
    else { await supabase.from("notification_templates" as any).insert(payload); toast.success("Template created"); }
    setTplDialog(false); load();
  };
  const deleteTpl = async (id: string) => { await supabase.from("notification_templates" as any).delete().eq("id", id); toast.success("Deleted"); load(); };

  const filtered = notifications.filter((n) => {
    if (tab === "scheduled" && !n.scheduled_at) return false;
    if (tab === "sent" && n.status !== "sent") return false;
    if (tab === "draft" && n.status !== "draft") return false;
    if (filterType !== "all" && n.type !== filterType) return false;
    if (filterStatus !== "all" && n.status !== filterStatus) return false;
    if (search) { const s = search.toLowerCase(); if (!n.title.toLowerCase().includes(s) && !n.message.toLowerCase().includes(s)) return false; }
    return true;
  });

  const stats = {
    total: notifications.length,
    draft: notifications.filter((n) => n.status === "draft").length,
    sent: notifications.filter((n) => n.status === "sent").length,
    scheduled: notifications.filter((n) => n.scheduled_at && n.status !== "sent").length,
    high: notifications.filter((n) => n.priority === "high" || n.priority === "urgent").length,
  };

  const statusColor = (s: string) => { if (s === "sent") return "bg-emerald-500/20 text-emerald-400"; if (s === "scheduled") return "bg-blue-500/20 text-blue-400"; if (s === "draft") return "bg-amber-500/20 text-amber-400"; return "bg-muted text-muted-foreground"; };
  const statusLabel = (s: string) => { if (s === "sent") return "Sent"; if (s === "scheduled") return "Scheduled"; return "Draft"; };
  const priorityColor = (p: string) => { if (p === "urgent") return "bg-red-500/20 text-red-400"; if (p === "high") return "bg-orange-500/20 text-orange-400"; return "bg-muted text-muted-foreground"; };
  const channelLabel = (c: string) => CHANNELS.find(ch => ch.value === c)?.label || c;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold">Notification System</h1>
          <p className="text-sm text-muted-foreground">Create, schedule & manage notifications</p>
        </div>
        <Button className="btn-gold gap-2" onClick={openCreate}><Plus className="w-4 h-4" /> New Notification</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total", value: stats.total, icon: Bell, color: "text-primary" },
          { label: "Draft", value: stats.draft, icon: Edit, color: "text-amber-400" },
          { label: "Sent", value: stats.sent, icon: Send, color: "text-emerald-400" },
          { label: "Scheduled", value: stats.scheduled, icon: Clock, color: "text-blue-400" },
          { label: "Urgent", value: stats.high, icon: Megaphone, color: "text-red-400" },
        ].map((s) => (
          <Card key={s.label} className="border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-secondary/60"><s.icon className={`w-5 h-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-[12px] text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {["all", "draft", "sent", "scheduled"].map((tabKey) => (
          <TabsContent key={tabKey} value={tabKey} className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Card className="border-border/30">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No notifications</TableCell></TableRow>
                  ) : filtered.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{n.title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{channelLabel(n.channel)}</Badge></TableCell>
                      <TableCell className="text-[12px]">{AUDIENCES.find((a) => a.value === n.audience)?.label || n.audience}</TableCell>
                      <TableCell><Badge className={`text-[11px] ${priorityColor(n.priority)}`}>{PRIORITIES.find(p => p.value === n.priority)?.label || n.priority}</Badge></TableCell>
                      <TableCell><Badge className={`text-[11px] ${statusColor(n.status)}`}>{statusLabel(n.status)}</Badge></TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">
                        {n.scheduled_at ? (<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(n.scheduled_at).toLocaleDateString()}</span>) : new Date(n.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewDialog(n)}><Eye className="w-3.5 h-3.5" /></Button>
                          {n.status !== "sent" && (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(n)}><Edit className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => sendNotification(n)}><Send className="w-3.5 h-3.5" /></Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400" onClick={() => deleteNotification(n.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Reusable notification templates</p>
            <Button variant="outline" className="gap-2" onClick={openCreateTpl}><Plus className="w-4 h-4" /> New Template</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="border-border/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div><p className="font-medium text-sm">{t.name}</p><p className="text-[12px] text-muted-foreground">{t.title}</p></div>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-[10px]">{channelLabel(t.channel)}</Badge>
                      <Badge variant="outline" className="text-[10px]">{TYPES.find(ty => ty.value === t.type)?.label || t.type}</Badge>
                    </div>
                  </div>
                  <p className="text-[12px] text-muted-foreground line-clamp-2">{t.message}</p>
                  {t.cta_text && <p className="text-[11px] text-primary">{t.cta_text} → {t.cta_link}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => useTemplate(t)}>Use</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => openEditTpl(t)}><Edit className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-400" onClick={() => deleteTpl(t.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {templates.length === 0 && <div className="col-span-full text-center py-8 text-muted-foreground text-sm">No templates</div>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Notification Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-serif">{editing ? "Edit Notification" : "New Notification"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div><label className="text-sm font-medium mb-1 block">Title *</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Notification title" /></div>
            <div><label className="text-sm font-medium mb-1 block">Message *</label><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Notification details" rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">Type</label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-sm font-medium mb-1 block">Channel</label><Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">Priority</label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-sm font-medium mb-1 block">Schedule (optional)</label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
            </div>
            <div><label className="text-sm font-medium mb-1 block">Audience</label><Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent></Select></div>
            {form.audience === "specific" && <div><label className="text-sm font-medium mb-1 block">User ID</label><Input value={form.target_user_id} onChange={(e) => setForm({ ...form, target_user_id: e.target.value })} placeholder="UUID" /></div>}
            <div><label className="text-sm font-medium mb-1 block">Link (optional)</label><Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="/orders, /dashboard" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="btn-gold" onClick={saveNotification}>{editing ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={tplDialog} onOpenChange={setTplDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-serif">{editingTpl ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium mb-1 block">Name *</label><Input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} placeholder="Template name" /></div>
            <div><label className="text-sm font-medium mb-1 block">Title *</label><Input value={tplForm.title} onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })} placeholder="Notification title" /></div>
            <div><label className="text-sm font-medium mb-1 block">Message</label><Textarea value={tplForm.message} onChange={(e) => setTplForm({ ...tplForm, message: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">Type</label><Select value={tplForm.type} onValueChange={(v) => setTplForm({ ...tplForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-sm font-medium mb-1 block">Channel</label><Select value={tplForm.channel} onValueChange={(v) => setTplForm({ ...tplForm, channel: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">CTA Text</label><Input value={tplForm.cta_text} onChange={(e) => setTplForm({ ...tplForm, cta_text: e.target.value })} placeholder="View Now" /></div>
              <div><label className="text-sm font-medium mb-1 block">CTA Link</label><Input value={tplForm.cta_link} onChange={(e) => setTplForm({ ...tplForm, cta_link: e.target.value })} placeholder="/orders" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTplDialog(false)}>Cancel</Button>
              <Button className="btn-gold" onClick={saveTpl}>{editingTpl ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">{viewDialog?.title}</DialogTitle></DialogHeader>
          {viewDialog && (
            <div className="space-y-3">
              <p className="text-sm">{viewDialog.message}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Type:</span> {TYPES.find((t) => t.value === viewDialog.type)?.label}</div>
                <div><span className="text-muted-foreground">Channel:</span> {channelLabel(viewDialog.channel)}</div>
                <div><span className="text-muted-foreground">Audience:</span> {AUDIENCES.find((a) => a.value === viewDialog.audience)?.label}</div>
                <div><span className="text-muted-foreground">Priority:</span> {PRIORITIES.find(p => p.value === viewDialog.priority)?.label}</div>
                <div><span className="text-muted-foreground">Status:</span> {statusLabel(viewDialog.status)}</div>
                {viewDialog.link && <div><span className="text-muted-foreground">Link:</span> {viewDialog.link}</div>}
                {viewDialog.scheduled_at && <div className="col-span-2"><span className="text-muted-foreground">Scheduled:</span> {new Date(viewDialog.scheduled_at).toLocaleString()}</div>}
                {viewDialog.sent_at && <div className="col-span-2"><span className="text-muted-foreground">Sent at:</span> {new Date(viewDialog.sent_at).toLocaleString()}</div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
