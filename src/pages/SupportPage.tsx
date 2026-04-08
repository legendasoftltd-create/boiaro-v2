import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Send, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const categories = [
  { value: "payment_issue", label: "পেমেন্ট সমস্যা" },
  { value: "book_access", label: "বই অ্যাক্সেস সমস্যা" },
  { value: "audiobook_playback", label: "অডিওবুক প্লেব্যাক সমস্যা" },
  { value: "subscription", label: "সাবস্ক্রিপশন সমস্যা" },
  { value: "refund", label: "রিফান্ড" },
  { value: "hardcopy_delivery", label: "হার্ডকপি ডেলিভারি সমস্যা" },
  { value: "account", label: "অ্যাকাউন্ট সমস্যা" },
  { value: "general", label: "সাধারণ সাহায্য" },
  { value: "other", label: "অন্যান্য" },
];

export default function SupportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    subject: "", category: "general", type: "ticket", message: "", user_name: "", user_email: "", user_phone: "",
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("লগইন করুন");
      const { error } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        subject: form.subject,
        category: form.category,
        type: form.type,
        message: form.message,
        user_name: form.user_name || null,
        user_email: form.user_email || user.email || null,
        user_phone: form.user_phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "টিকেট সাবমিট হয়েছে", description: "আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।" });
      navigate("/dashboard");
    },
    onError: (e: Error) => { toast({ title: "ত্রুটি", description: e.message, variant: "destructive" }); },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">সাহায্য প্রয়োজন?</h1>
          <p className="text-muted-foreground mb-6">টিকেট সাবমিট করতে লগইন করুন</p>
          <Button onClick={() => navigate("/auth")}>লগইন করুন</Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-12">
        <Card className="bg-card/80 border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-serif">
              <HelpCircle className="h-5 w-5 text-primary" />সাহায্য / সাপোর্ট
            </CardTitle>
            <p className="text-sm text-muted-foreground">আপনার সমস্যা বা অভিযোগ জানান</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">আপনার নাম</label>
                <Input value={form.user_name} onChange={e => setForm(f => ({ ...f, user_name: e.target.value }))} placeholder="নাম" />
              </div>
              <div>
                <label className="text-sm font-medium">ইমেইল</label>
                <Input value={form.user_email} onChange={e => setForm(f => ({ ...f, user_email: e.target.value }))} placeholder={user.email || "ইমেইল"} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">ফোন (ঐচ্ছিক)</label>
              <Input value={form.user_phone} onChange={e => setForm(f => ({ ...f, user_phone: e.target.value }))} placeholder="01XXXXXXXXX" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">ধরন</label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ticket">সাহায্য টিকেট</SelectItem>
                    <SelectItem value="complaint">অভিযোগ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">ক্যাটাগরি</label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">বিষয়</label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="সমস্যার সংক্ষিপ্ত বিবরণ" />
            </div>
            <div>
              <label className="text-sm font-medium">বিস্তারিত বর্ণনা</label>
              <Textarea rows={5} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="আপনার সমস্যা বিস্তারিত লিখুন..." />
            </div>
            <Button
              className="w-full"
              disabled={!form.subject.trim() || !form.message.trim() || submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              <Send className="h-4 w-4 mr-2" />{submitMutation.isPending ? "সাবমিট হচ্ছে..." : "টিকেট সাবমিট করুন"}
            </Button>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
