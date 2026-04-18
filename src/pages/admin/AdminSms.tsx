import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { Send, MessageSquare, History, Users, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";

type RecipientGroup = "authors" | "narrators" | "publishers" | "users" | "rj" | "custom";

interface Recipient {
  phone: string;
  name?: string;
  group?: string;
}

export default function AdminSms() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [recipientGroup, setRecipientGroup] = useState<RecipientGroup>("custom");
  const [customPhone, setCustomPhone] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);

  // Fetch group recipients
  const fetchGroupRecipients = async (group: RecipientGroup): Promise<Recipient[]> => {
    if (group === "custom") return [];
    const tableMap: Record<string, string> = {
      authors: "authors",
      narrators: "narrators",
      publishers: "publishers",
      users: "profiles",
      rj: "rj_profiles",
    };
    const table = tableMap[group];
    const nameCol = group === "users" ? "display_name" : "name";

    const { data, error } = await (supabase.from(table as any).select(`phone, ${nameCol}`) as any);
    if (error) throw error;
    return (data || [])
      .filter((r: any) => r.phone?.trim())
      .map((r: any) => ({
        phone: r.phone,
        name: r[nameCol] || "Unknown",
        group,
      }));
  };

  const groupQuery = useQuery({
    queryKey: ["sms-group-recipients", recipientGroup],
    queryFn: () => fetchGroupRecipients(recipientGroup),
    enabled: recipientGroup !== "custom",
  });

  const logsQuery = useQuery({
    queryKey: ["sms-logs"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sms_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100) as any);
      if (error) throw error;
      return data || [];
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["sms-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sms_templates" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any);
      if (error) throw error;
      return data || [];
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { recipients: Recipient[]; message: string }) => {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`SMS sent: ${data.sent} success, ${data.failed} failed, ${data.skipped} skipped`);
      queryClient.invalidateQueries({ queryKey: ["sms-logs"] });
      setMessage("");
      setSelectedRecipients([]);
      setCustomPhone("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to send SMS");
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (payload: { name: string; content: string }) => {
      const { error } = await (supabase
        .from("sms_templates" as any)
        .insert(payload) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template saved");
      queryClient.invalidateQueries({ queryKey: ["sms-templates"] });
    },
  });

  const handleAddCustom = () => {
    if (!customPhone.trim()) return;
    setSelectedRecipients((prev) => [
      ...prev,
      { phone: customPhone.trim(), name: "Custom", group: "custom" },
    ]);
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
    saveTemplateMutation.mutate({ name: name.trim(), content: message.trim() });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">SMS Center</h1>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>SSL Wireless Integration</AlertTitle>
        <AlertDescription>
          SMS sending requires <strong>SSL_SMS_API_TOKEN</strong> and <strong>SSL_SMS_SID</strong> secrets.
          Messages will be logged but delivery will fail until credentials are configured.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose"><Send className="h-4 w-4 mr-1.5" />Compose</TabsTrigger>
          <TabsTrigger value="logs"><History className="h-4 w-4 mr-1.5" />Logs</TabsTrigger>
          <TabsTrigger value="templates"><MessageSquare className="h-4 w-4 mr-1.5" />Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Recipients */}
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

                <div className="text-sm text-muted-foreground">
                  {selectedRecipients.length} recipient(s) selected
                </div>
                {selectedRecipients.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                    {selectedRecipients.slice(0, 20).map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="truncate">{r.name} — {r.phone}</span>
                        <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={() => setSelectedRecipients((p) => p.filter((_, j) => j !== i))}>✕</Button>
                      </div>
                    ))}
                    {selectedRecipients.length > 20 && (
                      <div className="text-xs text-muted-foreground">+{selectedRecipients.length - 20} more...</div>
                    )}
                  </div>
                )}
                <Button variant="destructive" size="sm" onClick={() => setSelectedRecipients([])} disabled={!selectedRecipients.length}>Clear All</Button>
              </CardContent>
            </Card>

            {/* Compose */}
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
                        <TableHead>Name</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(logsQuery.data as any[]).map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">{log.recipient_phone}</TableCell>
                          <TableCell className="text-sm">{log.recipient_name || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{log.recipient_group || "custom"}</Badge></TableCell>
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
                        <p className="text-xs text-muted-foreground truncate max-w-md">{t.content}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setMessage(t.content)}>Use</Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
