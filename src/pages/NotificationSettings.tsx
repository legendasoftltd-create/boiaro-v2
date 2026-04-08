import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, Mail, Megaphone, ShoppingCart, HeadphonesIcon, Clock } from "lucide-react";

interface Preferences {
  push_enabled: boolean;
  email_enabled: boolean;
  promotional_enabled: boolean;
  reminder_enabled: boolean;
  order_enabled: boolean;
  support_enabled: boolean;
}

const defaults: Preferences = {
  push_enabled: true,
  email_enabled: true,
  promotional_enabled: true,
  reminder_enabled: true,
  order_enabled: true,
  support_enabled: true,
};

export default function NotificationSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notification_preferences" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setPrefs({
            push_enabled: d.push_enabled,
            email_enabled: d.email_enabled,
            promotional_enabled: d.promotional_enabled,
            reminder_enabled: d.reminder_enabled,
            order_enabled: d.order_enabled,
            support_enabled: d.support_enabled,
          });
        }
        setLoading(false);
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { data: existing } = await supabase
      .from("notification_preferences" as any)
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("notification_preferences" as any)
        .update({ ...prefs, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } else {
      await supabase
        .from("notification_preferences" as any)
        .insert({ user_id: user.id, ...prefs });
    }
    toast.success("সেটিংস সেভ হয়েছে");
    setSaving(false);
  };

  const toggles = [
    { key: "push_enabled" as const, label: "পুশ নোটিফিকেশন", desc: "ব্রাউজার ও মোবাইল পুশ নোটিফিকেশন পান", icon: Bell },
    { key: "email_enabled" as const, label: "ইমেইল নোটিফিকেশন", desc: "গুরুত্বপূর্ণ আপডেট ইমেইলে পান", icon: Mail },
    { key: "promotional_enabled" as const, label: "প্রোমোশনাল বার্তা", desc: "নতুন বই, অফার ও ক্যাম্পেইন সম্পর্কে জানুন", icon: Megaphone },
    { key: "reminder_enabled" as const, label: "রিমাইন্ডার", desc: "পড়া চালিয়ে যান, সাবস্ক্রিপশন রিনিউ ইত্যাদি", icon: Clock },
    { key: "order_enabled" as const, label: "অর্ডার আপডেট", desc: "অর্ডার কনফার্মেশন ও শিপিং আপডেট", icon: ShoppingCart },
    { key: "support_enabled" as const, label: "সাপোর্ট আপডেট", desc: "টিকেটের উত্তর ও সাপোর্ট সম্পর্কিত বার্তা", icon: HeadphonesIcon },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-20 pb-8">
        <h1 className="text-2xl font-serif font-bold mb-1">নোটিফিকেশন সেটিংস</h1>
        <p className="text-sm text-muted-foreground mb-6">কোন ধরনের নোটিফিকেশন পেতে চান তা নির্বাচন করুন</p>

        <Card className="border-border/30">
          <CardContent className="p-0 divide-y divide-border/30">
            {toggles.map((t) => (
              <div key={t.key} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary/60">
                    <t.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-[12px] text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
                <Switch
                  checked={prefs[t.key]}
                  onCheckedChange={(v) => setPrefs({ ...prefs, [t.key]: v })}
                  disabled={loading}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end mt-4">
          <Button className="btn-gold" onClick={save} disabled={saving || loading}>
            {saving ? "সেভ হচ্ছে..." : "সেটিংস সেভ করুন"}
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
