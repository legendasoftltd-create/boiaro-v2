import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Mail, Send, Settings, Loader2, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function AdminEmailSettings() {
  const utils = trpc.useUtils();
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [form, setForm] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
    smtp_from_email: "",
    smtp_from_name: "BoiAro",
    smtp_secure: false,
  });

  const { data: smtpSettings, isLoading } = trpc.admin.getSmtpSettings.useQuery();

  useEffect(() => {
    if (smtpSettings) {
      setForm((prev) => ({
        ...prev,
        smtp_host: smtpSettings.smtp_host ?? "",
        smtp_port: smtpSettings.smtp_port ?? "587",
        smtp_user: smtpSettings.smtp_user ?? "",
        smtp_from_email: smtpSettings.smtp_from_email ?? "",
        smtp_from_name: smtpSettings.smtp_from_name ?? "BoiAro",
        smtp_secure: smtpSettings.smtp_secure === "true",
      }));
    }
  }, [smtpSettings]);

  const saveSmtp = trpc.admin.saveSmtpSettings.useMutation();
  const testConn = trpc.admin.testSmtpConnection.useMutation();
  const sendTestEmailMutation = trpc.admin.sendTestEmail.useMutation();

  const handleSave = async () => {
    if (!form.smtp_host || !form.smtp_user || !form.smtp_from_email) {
      toast.error("Host, username and from-email are required");
      return;
    }
    setSaving(true);
    try {
      await saveSmtp.mutateAsync({
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_user: form.smtp_user,
        smtp_pass: form.smtp_pass || undefined,
        smtp_from_email: form.smtp_from_email,
        smtp_from_name: form.smtp_from_name,
        smtp_secure: form.smtp_secure ? "true" : "false",
      });
      utils.admin.getSmtpSettings.invalidate();
      toast.success("SMTP settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings");
    }
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await testConn.mutateAsync();
      if (result.success) toast.success("SMTP connection successful!");
      else toast.error(result.error || "Connection failed");
    } catch (e: any) {
      toast.error(e.message || "Connection failed");
    }
    setTesting(false);
  };

  const handleSendTest = async () => {
    if (!testEmail) return toast.error("Enter a recipient email");
    setSending(true);
    try {
      await sendTestEmailMutation.mutateAsync({ recipientEmail: testEmail });
      toast.success("Test email sent!");
    } catch (e: any) {
      toast.error(e.message || "Failed to send test email");
    }
    setSending(false);
  };

  const field = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const isConfigured = !!(smtpSettings?.smtp_host && smtpSettings?.smtp_user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-primary">Email Settings</h1>
        <p className="text-sm text-muted-foreground">Configure SMTP for transactional emails and OTP delivery</p>
      </div>

      {/* SMTP Configuration */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5 text-primary" />
            SMTP Configuration
          </CardTitle>
          <CardDescription>
            Settings stored securely in platform_settings. Password field is write-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                {isConfigured ? (
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Configured
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Not configured
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>SMTP Host</Label>
                  <Input placeholder="smtp.gmail.com" value={form.smtp_host} onChange={field("smtp_host")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Port</Label>
                  <Input placeholder="587" value={form.smtp_port} onChange={field("smtp_port")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Username / Email</Label>
                  <Input placeholder="you@gmail.com" value={form.smtp_user} onChange={field("smtp_user")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Password / App Password</Label>
                  <div className="relative">
                    <Input
                      type={showPass ? "text" : "password"}
                      placeholder={isConfigured ? "••••••••  (leave blank to keep existing)" : "Enter password"}
                      value={form.smtp_pass}
                      onChange={field("smtp_pass")}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPass((v) => !v)}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>From Email</Label>
                  <Input placeholder="no-reply@yourdomain.com" value={form.smtp_from_email} onChange={field("smtp_from_email")} />
                </div>
                <div className="space-y-1.5">
                  <Label>From Name</Label>
                  <Input placeholder="BoiAro" value={form.smtp_from_name} onChange={field("smtp_from_name")} />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Switch
                  checked={form.smtp_secure}
                  onCheckedChange={(v) => setForm((prev) => ({ ...prev, smtp_secure: v }))}
                />
                <span className="text-sm">Use SSL/TLS (port 465)</span>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
                <Button variant="outline" onClick={handleTestConnection} disabled={testing || !isConfigured} className="gap-2">
                  {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Transactional Emails */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-primary" />
            Transactional Emails
          </CardTitle>
          <CardDescription>Automated emails sent via the configured SMTP server</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: "Password Reset OTP", desc: "6-digit OTP sent on reset-password request" },
            { label: "Welcome Email", desc: "Sent on new signup" },
            { label: "Order Confirmation", desc: "Sent after placing order" },
            { label: "Payment Update", desc: "Sent on payment success/failure" },
            { label: "Creator Application", desc: "Application status update" },
            { label: "Subscription Update", desc: "Subscription activation & expiry" },
            { label: "Withdrawal Update", desc: "Withdrawal approved/rejected" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 transition-colors">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch checked disabled />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Send Test Email */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            Send Test Email
          </CardTitle>
          <CardDescription>Verify email delivery end-to-end via the configured SMTP</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 max-w-md">
            <Input
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <Button onClick={handleSendTest} disabled={sending || !isConfigured} className="gap-2 shrink-0">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
          {!isConfigured && (
            <p className="text-xs text-muted-foreground mt-2">Configure and save SMTP settings above first.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
