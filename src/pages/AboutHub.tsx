import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  Info, Target, Sparkles, Users, Award, Newspaper, CalendarDays,
  HelpCircle, RotateCcw, ShieldCheck, FileText, Phone, Smartphone, ChevronRight,
} from "lucide-react";

// Fixed order per the "BoiAro সম্পর্কে" section spec — do not reorder without
// re-checking with product/content, since this order is intentional.
const SECTIONS = [
  { label: "BoiAro সম্পর্কে", href: "/page/about", icon: Info },
  { label: "আমাদের লক্ষ্য ও উদ্দেশ্য", href: "/page/mission", icon: Target },
  { label: "ফিচারসমূহ", href: "/page/features", icon: Sparkles },
  { label: "BoiAro টিম ও ম্যানেজমেন্ট", href: "/team", icon: Users },
  { label: "পুরস্কার ও স্বীকৃতি", href: "/blog?category=award", icon: Award },
  { label: "সংবাদ ও মিডিয়া", href: "/blog?category=news", icon: Newspaper },
  { label: "ইভেন্ট", href: "/blog?category=event", icon: CalendarDays },
  { label: "সাধারণ প্রশ্ন—FAQ", href: "/page/faq", icon: HelpCircle },
  { label: "রিফান্ড ও ক্যানসেলেশন নীতি", href: "/page/refund-policy", icon: RotateCcw },
  { label: "গোপনীয়তা নীতি", href: "/page/privacy-policy", icon: ShieldCheck },
  { label: "শর্তাবলি", href: "/page/terms", icon: FileText },
  { label: "যোগাযোগ", href: "/page/contact", icon: Phone },
  { label: "অ্যাপ তথ্য / Version Information", href: "/app-info", icon: Smartphone },
];

export default function AboutHub() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-3xl font-bold font-serif text-foreground mb-2">BoiAro সম্পর্কে</h1>
        <p className="text-muted-foreground mb-8">আমাদের প্ল্যাটফর্ম, নীতিমালা ও যোগাযোগ সংক্রান্ত সব তথ্য</p>

        <div className="rounded-xl border border-border/40 bg-card/60 divide-y divide-border/40 overflow-hidden">
          {SECTIONS.map((s) => (
            <Link
              key={s.label}
              to={s.href}
              className="flex items-center gap-3 px-5 py-4 hover:bg-secondary/40 transition-colors group"
            >
              <s.icon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground flex-1">{s.label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
