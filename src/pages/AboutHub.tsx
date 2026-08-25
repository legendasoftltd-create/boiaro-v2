import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  Info, Target, Sparkles, Users, Award, Newspaper, CalendarDays,
  HelpCircle, RotateCcw, ShieldCheck, FileText, Phone, Smartphone, ChevronRight,
} from "lucide-react";

// Fixed order per the "About BoiAro" section spec — do not reorder without
// re-checking with product/content, since this order is intentional.
const SECTIONS = [
  { label: "About BoiAro", href: "/page/about", icon: Info },
  { label: "Our Mission & Goals", href: "/page/mission", icon: Target },
  { label: "Features", href: "/page/features", icon: Sparkles },
  { label: "BoiAro Team & Management", href: "/team", icon: Users },
  { label: "Awards & Recognition", href: "/blog?category=award", icon: Award },
  { label: "News & Media", href: "/blog?category=news", icon: Newspaper },
  { label: "Events", href: "/blog?category=event", icon: CalendarDays },
  { label: "FAQ", href: "/page/faq", icon: HelpCircle },
  { label: "Refund & Cancellation Policy", href: "/page/refund-policy", icon: RotateCcw },
  { label: "Privacy Policy", href: "/page/privacy-policy", icon: ShieldCheck },
  { label: "Terms & Conditions", href: "/page/terms", icon: FileText },
  { label: "Contact", href: "/page/contact", icon: Phone },
  { label: "App Info / Version Information", href: "/app-info", icon: Smartphone },
];

export default function AboutHub() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-3xl font-bold font-serif text-foreground mb-2">About BoiAro</h1>
        <p className="text-muted-foreground mb-8">Everything about our platform, policies, and contact information</p>

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
