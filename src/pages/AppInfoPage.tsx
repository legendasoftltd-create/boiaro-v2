import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Download, Globe } from "lucide-react";

export default function AppInfoPage() {
  const { get, isOn } = useSiteSettings();
  const brandName = get("brand_name", "BoiAro");
  const appVersion = get("app_version", "1.0.0");
  const appAndroid = get("app_android_url");
  const appIos = get("app_ios_url");
  const showApp = isOn("app_download_enabled");

  const rows = [
    { label: "প্ল্যাটফর্ম", value: "Web" },
    { label: "ভার্শন", value: appVersion },
    { label: "সর্বশেষ আপডেট", value: new Date().toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" }) },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-3xl font-bold font-serif text-foreground mb-2">অ্যাপ তথ্য / Version Information</h1>
        <p className="text-muted-foreground mb-8">{brandName} সম্পর্কে প্রযুক্তিগত তথ্য</p>

        <div className="rounded-xl border border-border/40 bg-card/60 divide-y divide-border/40">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between px-5 py-4">
              <span className="text-sm text-muted-foreground">{r.label}</span>
              <span className="text-sm font-medium text-foreground">{r.value}</span>
            </div>
          ))}
        </div>

        {showApp && (appAndroid || appIos) && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" /> মোবাইল অ্যাপ ডাউনলোড করুন
            </h2>
            <div className="flex flex-wrap gap-3">
              {appAndroid && (
                <a href={appAndroid} target="_blank" rel="noopener noreferrer"
                  className="text-sm px-4 py-2 rounded-lg border border-border/40 hover:border-primary/40 text-foreground transition-colors">
                  Android অ্যাপ
                </a>
              )}
              {appIos && (
                <a href={appIos} target="_blank" rel="noopener noreferrer"
                  className="text-sm px-4 py-2 rounded-lg border border-border/40 hover:border-primary/40 text-foreground transition-colors">
                  iOS অ্যাপ
                </a>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 text-sm text-muted-foreground flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span>ওয়েব সংস্করণ ব্যবহার করছেন। আইনি ও নীতিমালা সংক্রান্ত তথ্যের জন্য দেখুন </span>
          <Link to="/page/terms" className="text-primary hover:underline">শর্তাবলি</Link>
          <span>ও</span>
          <Link to="/page/privacy-policy" className="text-primary hover:underline">গোপনীয়তা নীতি</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
