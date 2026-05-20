import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, MessageSquare, History, Users, AlertTriangle, CheckCircle, XCircle, Loader2, Settings, Plus, Pencil, Trash2, Star } from "lucide-react";
import { format } from "date-fns";

type RecipientGroup = "authors" | "narrators" | "publishers" | "users" | "rj" | "custom";

interface Recipient {
  phone: string;
  name?: string;
  group?: string;
}

interface SidFormData {
  label: string;
  sid: string;
  api_token: string;
  otp_secret: string;
  is_active: boolean;
  is_default: boolean;
}

const emptySidForm = (): SidFormData => ({
  label: "", sid: "", api_token: "", otp_secret: "", is_active: true, is_default: false,
});

export default function AdminSms() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [recipientGroup, setRecipientGroup] = useState<RecipientGroup>("custom");
  const [customPhone, setCustomPhone] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);

  // SID dialog state
  const [sidDialog, setSidDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [sidForm, setSidForm] = useState<SidFormData>(emptySidForm());

  const { data: smsStatus } = trpc.admin.smsStatus.useQuery();
  const sidsQuery = trpc.admin.listSmsSids.useQuery();

  const fetchGroupRecipients = async (group: RecipientGroup): Promise<Recipient[]> => {
    if (group === "custom") return [];
    return utils.admin.smsRecipientsByGroup.fetch({ group }) as Promise<Recipient[]>;
  };

  const groupQuery = useQuery({
    queryKey: ["sms-group-recipients", recipientGroup],
    queryFn: () => fetchGroupRecipients(recipientGroup),
    enabled: recipientGroup !== "custom",
  });

  const logsQuery = useQuery({
    queryKey: ["sms-logs"],
    queryFn: () => utils.admin.listSmsLogs.fetch({ limit: 100 }),
  });

  const templatesQuery = useQuery({
    queryKey: ["sms-templates"],
    queryFn: () => utils.admin.listSmsTemplates.fetch(),
  });

  const sendMutation = trpc.admin.sendSms.useMutation({
    onSuccess: (data) => {
      if (data.failed > 0 && data.errors?.length) {
        toast.error(`SMS: ${data.sent} sent, ${data.failed} failed — ${data.errors.join("; ")}`);
      } else {
        toast.success(`SMS sent: ${data.sent} success, ${data.failed} failed, ${data.skipped} skipped`);
      }
      queryClient.invalidateQueries({ queryKey: ["sms-logs"] });
      setMessage("");
      setSelectedRecipients([]);
      setCustomPhone("");
    },
    onError: (err: any) => toast.error(err.message || "Failed to send SMS"),
  });

  const saveTemplateMutation = trpc.admin.createSmsTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      queryClient.invalidateQueries({ queryKey: ["sms-templates"] });
    },
  });

  // SID mutations
  const createSidMutation = trpc.admin.createSmsSid.useMutation({
    onSuccess: () => { toast.success("SID added"); sidsQuery.refetch(); closeSidDialog(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateSidMutation = trpc.admin.updateSmsSid.useMutation({
    onSuccess: () => { toast.success("SID updated"); sidsQuery.refetch(); closeSidDialog(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteSidMutation = trpc.admin.deleteSmsSid.useMutation({
    onSuccess: () => { toast.success("SID deleted"); sidsQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const setDefaultMutation = trpc.admin.setDefaultSmsSid.useMutation({
    onSuccess: () => { toast.success("Default SID updated"); sidsQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAddSid = () => { setSidForm(emptySidForm()); setSidDialog({ open: true }); };
  const openEditSid = (sid: any) => {
    setSidForm({
      label: sid.label, sid: sid.sid, api_token: sid.api_token,
      otp_secret: sid.otp_secret ?? "", is_active: sid.is_active, is_default: sid.is_default,
    });
    setSidDialog({ open: true, editId: sid.id });
  };
  const closeSidDialog = () => setSidDialog({ open: false });

  const handleSaveSid = () => {
    if (!sidForm.label.trim() || !sidForm.sid.trim() || !sidForm.api_token.trim()) {
      return toast.error("Label, SID, and API Token are required");
    }
    const data = {
      ...sidForm,
      otp_secret: sidForm.otp_secret.trim() || undefined,
    };
    if (sidDialog.editId) {
      updateSidMutation.mutate({ id: sidDialog.editId, ...data });
    } else {
      createSidMutation.mutate(data);
    }
  };

  const handleAddCustom = () => {
    if (!customPhone.trim()) return;
    setSelectedRecipients((prev) => [...prev, { phone: customPhone.trim(), name: "Custom", group: "custom" }]);
    setCustomPhone("");
  };

  const handleLoadGroup = () => {
    if (groupQuery.data?.length) {
      setSelectedRecipients(groupQuery.data);
      toast.success(`Loaded ${groupQuery.data.length} recipients from ${recipientGroup}`);
    } else {
      toast.error("No recipients with phone numbers in this group");
    }
  };

  const handleSend = () => {
    if (!message.trim()) return toast.error("Please write a message");
    if (!selectedRecipients.length) return toast.error("No recipients selected");
    sendMutation.mutate({ recipients: selectedRecipients, message: message.trim() });
  };

  const handleSaveTemplate = () => {
    if (!message.trim()) return toast.error("Write a message first");
    const name = prompt("Template name:");
    if (!name?.trim()) return;
    saveTemplateMutation.mutate({ name: name.trim(), body: message.trim() });
  };

  const isSaving = createSidMutation.isPending || updateSidMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">SMS Center</h1>
      </div>

      {smsStatus && !smsStatus.configured && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>SSL Wireless Not Configured</AlertTitle>
          <AlertDescription>
            No active SID found. Add one in the <strong>SID Management</strong> tab below.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose"><Send className="h-4 w-4 mr-1.5" />Compose</TabsTrigger>
          <TabsTrigger value="logs"><History className="h-4 w-4 mr-1.5" />Logs</TabsTrigger>
          <TabsTrigger value="templates"><MessageSquare className="h-4 w-4 mr-1.5" />Templates</TabsTrigger>
          <TabsTrigger value="sids"><Settings className="h-4 w-4 mr-1.5" />SID Management</TabsTrigger>
        </TabsList>

        {/* ── Compose ── */}
        <TabsContent value="compose" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Recipients</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Select value={recipientGroup} onValueChange={(v) => setRecipientGroup(v as RecipientGroup)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom Number</SelectItem>
                      <SelectItem value="authors">All Authors</SelectItem>
                      <SelectItem value="narrators">All Narrators</SelectItem>
                      <SelectItem value="publishers">All Publishers</SelectItem>
                      <SelectItem value="users">All Users</SelectItem>
                      <SelectItem value="rj">All RJs</SelectItem>
                    </SelectContent>
                  </Select>
                  {recipientGroup !== "custom" && (
                    <Button variant="outline" size="sm" onClick={handleLoadGroup} disabled={groupQuery.isLoading}>
                      {groupQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
                    </Button>
                  )}
                </div>
                {recipientGroup === "custom" && (
                  <div className="flex gap-2">
                    <Input placeholder="+880XXXXXXXXXX" value={customPhone} onChange={(e) => setCustomPhone(e.target.value)} type="tel" />
                    <Button variant="outline" size="sm" onClick={handleAddCustom}>Add</Button>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">{selectedRecipients.length} recipient(s) selected</div>
                {selectedRecipients.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                    {selectedRecipients.slice(0, 20).map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="truncate">{r.name} — {r.phone}</span>
                        <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={() => setSelectedRecipients((p) => p.filter((_, j) => j !== i))}>✕</Button>
                      </div>
                    ))}
                    {selectedRecipients.length > 20 && <div className="text-xs text-muted-foreground">+{selectedRecipients.length - 20} more…</div>}
                  </div>
                )}
                <Button variant="destructive" size="sm" onClick={() => setSelectedRecipients([])} disabled={!selectedRecipients.length}>Clear All</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" />Message</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Message ({message.length}/480 chars)</Label>
                  <Textarea placeholder="Type your SMS message…" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={480} rows={6} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleSend} disabled={sendMutation.isPending || !message.trim() || !selectedRecipients.length}>
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                    Send SMS
                  </Button>
                  <Button variant="outline" onClick={handleSaveTemplate} disabled={!message.trim()}>Save as Template</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Logs ── */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">SMS History</CardTitle></CardHeader>
            <CardContent>
              {logsQuery.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !logsQuery.data?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No SMS logs yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phone</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(logsQuery.data as any[]).map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">{log.phone_number}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">{log.message}</TableCell>
                          <TableCell>
                            {log.status === "sent" ? (
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Sent</Badge>
                            ) : log.status === "failed" ? (
                              <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>
                            ) : (
                              <Badge variant="secondary">{log.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(log.created_at), "dd MMM yy, HH:mm")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Templates ── */}
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Reusable Templates</CardTitle></CardHeader>
            <CardContent>
              {templatesQuery.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !templatesQuery.data?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No templates yet. Save one from the Compose tab.</p>
              ) : (
                <div className="space-y-2">
                  {(templatesQuery.data as any[]).map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between border rounded-md p-3">
                      <div>
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-md">{t.body}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setMessage(t.body)}>Use</Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SID Management ── */}
        <TabsContent value="sids" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Sender IDs</h2>
              <p className="text-sm text-muted-foreground">Manage SSL Wireless SIDs. The default active SID is used for all SMS and OTP.</p>
            </div>
            <Button size="sm" onClick={openAddSid}><Plus className="h-4 w-4 mr-1.5" />Add SID</Button>
          </div>

          {sidsQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !sidsQuery.data?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Settings className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground mb-4">No SIDs configured yet.</p>
                <Button size="sm" onClick={openAddSid}><Plus className="h-4 w-4 mr-1.5" />Add First SID</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>SID</TableHead>
                    <TableHead>OTP Secret</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sidsQuery.data as any[]).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell className="font-mono text-xs">{s.sid}</TableCell>
                      <TableCell>
                        {s.otp_secret ? (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-500/30">Set</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Not set</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.is_active ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.is_default ? (
                          <Badge className="text-xs"><Star className="h-3 w-3 mr-1 fill-current" />Default</Badge>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setDefaultMutation.mutate({ id: s.id })} disabled={setDefaultMutation.isPending}>
                            Set Default
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSid(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm(`Delete SID "${s.label}"?`)) deleteSidMutation.mutate({ id: s.id }); }}
                            disabled={deleteSidMutation.isPending}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add/Edit SID Dialog ── */}
      <Dialog open={sidDialog.open} onOpenChange={(o) => !o && closeSidDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{sidDialog.editId ? "Edit SID" : "Add New SID"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Label <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. OTP SID, Marketing SID" value={sidForm.label} onChange={(e) => setSidForm((p) => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Sender ID (SID) <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. 01XXXXXXXXX or BOIARO" value={sidForm.sid} onChange={(e) => setSidForm((p) => ({ ...p, sid: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>API Token <span className="text-destructive">*</span></Label>
              <Input placeholder="SSL Wireless API token" value={sidForm.api_token} onChange={(e) => setSidForm((p) => ({ ...p, api_token: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>OTP Secret <span className="text-muted-foreground text-xs">(optional — required for phone OTP login)</span></Label>
              <Input placeholder="From SSL Wireless Secure OTP settings" value={sidForm.otp_secret} onChange={(e) => setSidForm((p) => ({ ...p, otp_secret: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label htmlFor="sid-active">Active</Label>
              <Switch id="sid-active" checked={sidForm.is_active} onCheckedChange={(v) => setSidForm((p) => ({ ...p, is_active: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sid-default">Set as Default</Label>
              <Switch id="sid-default" checked={sidForm.is_default} onCheckedChange={(v) => setSidForm((p) => ({ ...p, is_default: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSidDialog}>Cancel</Button>
            <Button onClick={handleSaveSid} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {sidDialog.editId ? "Save Changes" : "Add SID"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
