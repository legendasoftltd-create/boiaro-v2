import { Facebook, Instagram, Youtube, Twitter, Mail, Phone, MapPin, Download } from "lucide-react";

const socialIconMap: Record<string, React.ElementType> = {
  social_facebook: Facebook,
  social_youtube: Youtube,
  social_instagram: Instagram,
  social_twitter: Twitter,
};

const quickLinks = ["eBooks", "Audiobooks", "Hard Copies", "Authors", "Narrators", "Categories"];
const POLICY_KEYS = ["policy_link_our_policy", "policy_link_terms", "policy_link_privacy", "policy_link_refund", "policy_link_delete_account"];

export function FooterPreview({ values }: { values: Record<string, string> }) {
  const get = (key: string, fallback = "") => values[key] || fallback;
  const isOn = (key: string) => get(key) === "true";

  const brandName = get("brand_name", "BoiAro");
  const footerAbout = get("footer_about", "BoiAro is your digital destination for Bengali literature.");
  const trustLine = get("footer_trust_line");
  const contactEmail = get("contact_email");
  const contactPhone = get("contact_phone");
  const contactAddress = get("contact_address");
  const copyrightText = get("copyright_text", "© 2026 BoiAro. All rights reserved.");
  const bottomTagline = get("bottom_tagline");
  const logoUrl = get("logo_footer_url") || get("logo_url");
  const appAndroid = get("app_android_url");
  const appIos = get("app_ios_url");
  const showApp = isOn("app_download_enabled");
  const followUsText = get("follow_us_text");

  const showAbout = isOn("footer_section_about") !== false ? get("footer_section_about") !== "false" : true;
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

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card text-card-foreground text-[11px] leading-relaxed">
      <div className="px-4 py-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {showAbout && (
            <div className="col-span-2 lg:col-span-1">
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className="h-5 object-contain mb-2" />
              ) : (
                <span className="text-sm font-serif font-bold text-primary block mb-2">{brandName}</span>
              )}
              <p className="text-muted-foreground text-[10px] leading-snug">{footerAbout}</p>
              {trustLine && <p className="text-muted-foreground/70 text-[10px] italic mt-1">{trustLine}</p>}
            </div>
          )}

          {showQuickLinks && (
            <div>
              <h4 className="font-semibold text-[10px] uppercase tracking-wide mb-2">Quick Links</h4>
              <ul className="space-y-1">
                {quickLinks.map((l) => (
                  <li key={l} className="text-muted-foreground text-[10px]">{l}</li>
                ))}
              </ul>
            </div>
          )}

          {showSupport && (
            <div>
              <h4 className="font-semibold text-[10px] uppercase tracking-wide mb-2">Support</h4>
              <ul className="space-y-1">
                <li className="text-muted-foreground text-[10px]">Help Center</li>
                {POLICY_KEYS.map((key) => {
                  const isActive = get(`${key}_active`) !== "false";
                  const label = get(`${key}_label`);
                  if (!isActive || !label) return null;
                  return <li key={key} className="text-muted-foreground text-[10px]">{label}</li>;
                })}
                <li className="text-muted-foreground text-[10px]">Contact Us</li>
              </ul>
            </div>
          )}

          {showContact && (
            <div>
              <h4 className="font-semibold text-[10px] uppercase tracking-wide mb-2">Contact</h4>
              <ul className="space-y-1.5">
                {contactEmail && (
                  <li className="flex items-center gap-1 text-muted-foreground text-[10px]">
                    <Mail className="w-3 h-3 shrink-0" /> {contactEmail}
                  </li>
                )}
                {contactPhone && (
                  <li className="flex items-center gap-1 text-muted-foreground text-[10px]">
                    <Phone className="w-3 h-3 shrink-0" /> {contactPhone}
                  </li>
                )}
                {contactAddress && (
                  <li className="flex items-center gap-1 text-muted-foreground text-[10px]">
                    <MapPin className="w-3 h-3 shrink-0" /> {contactAddress}
                  </li>
                )}
              </ul>
            </div>
          )}

          {showSocial && (
            <div>
              <h4 className="font-semibold text-[10px] uppercase tracking-wide mb-2">Follow Us</h4>
              {followUsText && <p className="text-muted-foreground text-[10px] mb-2">{followUsText}</p>}
              {socialLinks.length > 0 && (
                <div className="flex gap-1.5">
                  {socialLinks.map((s) => (
                    <div key={s.key} className="w-6 h-6 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground">
                      <s.icon className="w-3 h-3" />
                    </div>
                  ))}
                </div>
              )}
              {showApp && (appAndroid || appIos) && (
                <div className="mt-2 space-y-1">
                  {appAndroid && <div className="flex items-center gap-1 text-muted-foreground text-[10px]"><Download className="w-2.5 h-2.5" /> Android</div>}
                  {appIos && <div className="flex items-center gap-1 text-muted-foreground text-[10px]"><Download className="w-2.5 h-2.5" /> iOS</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{copyrightText}</span>
          {bottomTagline && <span className="text-[10px] text-muted-foreground">{bottomTagline}</span>}
        </div>
      </div>
    </div>
  );
}
