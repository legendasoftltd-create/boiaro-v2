import { Facebook, Instagram, Youtube, Twitter, Mail, Phone, MapPin, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useIsMobile } from "@/hooks/use-mobile";

const quickLinks = [
  { label: "eBooks", href: "/#books" },
  { label: "Audiobooks", href: "/#audiobooks" },
  { label: "Hard Copies", href: "/#hardcopy" },
  { label: "Authors", href: "/authors" },
  { label: "Narrators", href: "/narrators" },
  { label: "Categories", href: "/#categories" },
];

const POLICY_KEYS = [
  "policy_link_our_policy",
  "policy_link_terms",
  "policy_link_privacy",
  "policy_link_refund",
  "policy_link_delete_account",
] as const;

const socialIconMap: Record<string, React.ElementType> = {
  social_facebook: Facebook,
  social_youtube: Youtube,
  social_instagram: Instagram,
  social_twitter: Twitter,
};

export function Footer() {
  const { get, isOn } = useSiteSettings();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();

  const brandName = get("brand_name", "BoiAro");
  const footerAbout = get("footer_about", "BoiAro is your digital destination for Bengali literature — read eBooks, listen to audiobooks, and order hard copies in one place.");
  const trustLine = get("footer_trust_line", "Trusted by readers across Bangladesh.");
  const contactEmail = get("contact_email", "info@boiaro.com");
  const contactPhone = get("contact_phone", "+880 1732821824");
  const contactAddress = get("contact_address", "Dhaka, Bangladesh");
  const followUsText = get("follow_us_text", "Stay connected with us for new releases, updates, and exclusive content.");
  const copyrightText = get("copyright_text", "© 2026 BoiAro. All rights reserved.");
  const bottomTagline = get("bottom_tagline", "Built for readers. Powered by passion.");
  const appAndroid = get("app_android_url");
  const appIos = get("app_ios_url");
  const showApp = isOn("app_download_enabled");

  // Logo variants: footer logo > dark logo (in dark mode) > mobile logo (on mobile) > default
  const logoDefault = get("logo_url");
  const logoFooter = get("logo_footer_url");
  const logoDark = get("logo_dark_url");
  const logoMobile = get("logo_mobile_url");

  let logoUrl = logoDefault;
  if (isMobile && logoMobile) logoUrl = logoMobile;
  if (resolvedTheme === "dark" && logoDark) logoUrl = logoDark;
  if (logoFooter) logoUrl = logoFooter;

  // Section visibility
  const showAbout = get("footer_section_about") !== "false";
  const showQuickLinks = get("footer_section_quicklinks") !== "false";
  const showSupport = get("footer_section_support") !== "false";
  const showContact = get("footer_section_contact") !== "false";
  const showSocial = get("footer_section_social") !== "false";

  const socialLinks = [
    { key: "social_facebook", label: "Facebook" },
    { key: "social_youtube", label: "YouTube" },
    { key: "social_instagram", label: "Instagram" },
    { key: "social_twitter", label: "Twitter" },
  ]
    .map((s) => ({ ...s, href: get(s.key), icon: socialIconMap[s.key] }))
    .filter((s) => s.href);

  const visibleSections = [showAbout, showQuickLinks, showSupport, showContact, showSocial].filter(Boolean).length;
  if (visibleSections === 0) return null;

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">
          {showAbout && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Link to="/" className="inline-block mb-4">
                {logoUrl ? (
                  <img src={logoUrl} alt={brandName} className="h-8 object-contain" />
                ) : (
                  <span className="text-2xl font-serif font-bold text-primary">{brandName}</span>
                )}
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed mb-2">{footerAbout}</p>
              {trustLine && <p className="text-sm text-muted-foreground/70 italic">{trustLine}</p>}
            </div>
          )}

          {(showQuickLinks || showSupport) && (
            <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-2 gap-6 lg:grid-cols-2">
              {showQuickLinks && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4 text-[13px] tracking-wide uppercase">Quick Links</h3>
                  <ul className="space-y-2.5">
                    {quickLinks.map((link) => (
                      <li key={link.label}>
                        <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {showSupport && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4 text-[13px] tracking-wide uppercase">Support</h3>
                  <ul className="space-y-2.5">
                    <li>
                      <Link to="/support" className="text-sm text-muted-foreground hover:text-primary transition-colors">Help Center</Link>
                    </li>
                    {POLICY_KEYS.map((key) => {
                      const isActive = get(`${key}_active`) !== "false";
                      const label = get(`${key}_label`);
                      const url = get(`${key}_url`);
                      if (!isActive || !label || !url) return null;
                      return (
                        <li key={key}>
                          <Link to={url} className="text-sm text-muted-foreground hover:text-primary transition-colors">{label}</Link>
                        </li>
                      );
                    })}
                    <li>
                      <Link to="/support" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contact Us</Link>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {(showContact || showSocial) && (
            <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-2 gap-6">
              {showContact && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4 text-[13px] tracking-wide uppercase">Contact</h3>
                  <ul className="space-y-3">
                    {contactEmail && (
                      <li>
                        <a href={`mailto:${contactEmail}`} className="flex items-start gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors">
                          <Mail className="w-4 h-4 mt-0.5 shrink-0" /><span className="break-all">{contactEmail}</span>
                        </a>
                      </li>
                    )}
                    {contactPhone && (
                      <li>
                        <a href={`tel:${contactPhone.replace(/\s/g, "")}`} className="flex items-start gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors">
                          <Phone className="w-4 h-4 mt-0.5 shrink-0" /><span>{contactPhone}</span>
                        </a>
                      </li>
                    )}
                    {contactAddress && (
                      <li>
                        <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0" /><span>{contactAddress}</span>
                        </div>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {showSocial && (
                <div>
                  <h3 className="font-semibold text-foreground mb-4 text-[13px] tracking-wide uppercase">Follow Us</h3>
                  {followUsText && <p className="text-sm text-muted-foreground leading-relaxed mb-4">{followUsText}</p>}
                  {socialLinks.length > 0 && (
                    <div className="flex items-center gap-2 mb-4 justify-end lg:justify-start">
                      {socialLinks.map((social) => (
                        <a key={social.key} href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label}
                          className="w-9 h-9 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-200">
                          <social.icon className="w-4 h-4" />
                        </a>
                      ))}
                    </div>
                  )}
                  {showApp && (appAndroid || appIos) && (
                    <div className="space-y-2">
                      {appAndroid && (
                        <a href={appAndroid} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors">
                          <Download className="w-3.5 h-3.5" /> Android App
                        </a>
                      )}
                      {appIos && (
                        <a href={appIos} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors">
                          <Download className="w-3.5 h-3.5" /> iOS App
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-10 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-2 pb-2">
          <p className="text-xs text-muted-foreground">{copyrightText}</p>
          {bottomTagline && <p className="text-xs text-muted-foreground">{bottomTagline}</p>}
        </div>
      </div>
    </footer>
  );
}