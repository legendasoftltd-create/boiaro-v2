import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Share2, Gift, Users, Coins, Clock, Check, ChevronLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface ReferralInfo {
  referral_code: string;
  total_referrals: number;
  total_earned: number;
  pending_referrals: number;
  referrals: Array<{
    id: string;
    referred_user_id: string;
    status: string;
    reward_amount: number;
    reward_status: string;
    created_at: string;
  }>;
}

export default function InvitePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { get } = useSiteSettings();
  const brandName = get("brand_name", "BoiAro");
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user) loadInfo();
  }, [user]);

  const loadInfo = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("process-referral", {
      body: { action: "get_info" },
    });
    if (!error && data && !data.error) {
      setInfo(data);
    }
    setLoading(false);
  };

  const referralLink = info?.referral_code
    ? `${window.location.origin}/auth?ref=${info.referral_code}`
    : "";

  const copyCode = () => {
    if (!info?.referral_code) return;
    navigator.clipboard.writeText(info.referral_code);
    setCopied(true);
    toast.success("Code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copied!");
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `📚 Join ${brandName} and get free coins! Use my referral code: ${info?.referral_code}\n${referralLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`,
      "_blank"
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center pt-20 pb-32">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-20 pb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4 text-muted-foreground">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Gift className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Invite & Earn</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Share your code, earn coins when friends join!
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: Users, label: "Total Invited", value: info?.total_referrals || 0, color: "text-primary" },
            { icon: Coins, label: "Coins Earned", value: info?.total_earned || 0, color: "text-amber-500" },
            { icon: Clock, label: "Pending", value: info?.pending_referrals || 0, color: "text-blue-500" },
            { icon: Check, label: "Completed", value: (info?.total_referrals || 0) - (info?.pending_referrals || 0), color: "text-emerald-500" },
          ].map((s) => (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="p-4 text-center">
                <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-1`} />
                <p className="text-xl font-bold text-foreground">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Referral Code */}
        <Card className="bg-card border-primary/20 mb-6">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-foreground mb-3">Your Referral Code</p>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 bg-secondary/50 rounded-xl px-4 py-3 text-center">
                <span className="text-2xl font-bold font-mono tracking-widest text-primary">
                  {info?.referral_code || "—"}
                </span>
              </div>
              <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={copyCode}>
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mb-3">Or share your referral link:</p>
            <div className="flex gap-2">
              <Input value={referralLink} readOnly className="text-xs bg-secondary/30" />
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="w-3 h-3 mr-1" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Share Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button
            variant="outline"
            className="h-12 gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
            onClick={shareWhatsApp}
          >
            <MessageCircle className="w-5 h-5" /> Share on WhatsApp
          </Button>
          <Button
            variant="outline"
            className="h-12 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
            onClick={shareFacebook}
          >
            <Share2 className="w-5 h-5" /> Share on Facebook
          </Button>
        </div>

        {/* How it works */}
        <Card className="bg-card border-border mb-6">
          <CardHeader>
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { step: "1", text: "Share your unique referral code or link with friends" },
              { step: "2", text: "Your friend signs up using your code" },
              { step: "3", text: "You earn coins automatically when they join" },
              { step: "4", text: "Use coins to unlock books, audiobooks, and more!" },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{s.step}</span>
                </div>
                <p className="text-sm text-muted-foreground pt-0.5">{s.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Referral History */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Referral History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!info?.referrals || info.referrals.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No referrals yet — start sharing!
                    </TableCell>
                  </TableRow>
                ) : (
                  info.referrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.status === "completed" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-primary">
                        +{r.reward_amount} coins
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
