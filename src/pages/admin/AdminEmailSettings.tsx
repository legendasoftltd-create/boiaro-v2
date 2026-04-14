import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Mail, Send, Settings, CheckCircle, Info } from "lucide-react";
import SummaryCard from '@/components/admin/SummaryCard';


export default function AdminEmailSettings() {
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  const sendTestEmail = async () => {
    if (!testEmail) return toast.error("Please enter an email address");
    setSending(true);
    try {
      // Use the platform's built-in email to send a test
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "test-email",
          recipientEmail: testEmail,
          idempotencyKey: `test-${Date.now()}`,
          templateData: { user_name: "Admin" },
        },
      });
      if (error) {
        toast.error("Failed to send test email. Set up email domain.");
      } else {
        toast.success("Test email sent!");
      }
    } catch {
      toast.error("Error sending email");
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-black">Email Settings</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Status */}
        <Card className=" border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-primary" />
              Email Delivery Status
            </CardTitle>
            <CardDescription className="text-white">Lovable Cloud built-in email system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 ">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Email Provider</span>
              </div>
              <Badge className="bg-primary/10 text-primary border-primary/20">Lovable Cloud</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Auto Retry</span>
              </div>
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">No SMTP configuration needed</span>
              </div>
              <Badge variant="outline">Managed</Badge>
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">
                BoiAro uses Lovable Cloud's built-in email infrastructure. 
                Go to Cloud → Emails settings to set up email domain.
                Emails will be sent automatically after DNS verification.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="bg-card/60 border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-primary" />
              Transactional Emails
            </CardTitle>
            <CardDescription className="text-white">Automated emails for system events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 bg-white">
            {[
              { label: "Welcome Email", desc: "Sent on new signup", enabled: true },
              { label: "Order Confirmation", desc: "Sent after placing order", enabled: true },
              { label: "Payment Update", desc: "Sent on payment success/failure", enabled: true },
              { label: "Creator Application", desc: "Application status update", enabled: true },
              { label: "Subscription Update", desc: "Subscription activation & expiry", enabled: true },
              { label: "Withdrawal Update", desc: "Withdrawal approved/rejected", enabled: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 transition-colors">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-black">{item.desc}</p>
                </div>
                <Switch checked={item.enabled} disabled />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Test Email */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            Send Test Email
          </CardTitle>
          <CardDescription className="text-white">Test email delivery</CardDescription>
        </CardHeader>
        <CardContent className="bg-white">
          <div className="flex gap-3 max-w-md">
            <Input
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <Button onClick={sendTestEmail} disabled={sending} className="gap-2 shrink-0">
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
