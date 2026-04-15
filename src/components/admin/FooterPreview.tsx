import { Facebook, Instagram, Youtube, Twitter, Mail, Phone, MapPin, Download } from "lucide-react";
import { Link } from "react-router-dom";

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
    <> 
    {/* <div className="rounded-lg border border-border overflow-hidden bg-card text-card-foreground text-[11px] leading-relaxed">
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
    </div> */}

    <footer> 
            
    
              <div className="bg-gray-100 py-16 px-6">
                <div className="max-w-screen-xl mx-auto">
                  <div className="grid lg:grid-cols-3 gap-8">
                    <div className="max-w-sm">
                      <a href='javascript:void(0)'>
                        
                        <Link to="/" className="inline-block mb-4">
                        {logoUrl ? (
                          <img src={logoUrl} alt={brandName} className="h-8 object-contain" />
                        ) : (
                          <span className="text-2xl font-serif font-bold text-primary">{brandName}</span>
                        )}
                      </Link>
                      </a>
                      <div className="mt-4">
                        <p className="text-slate-900 leading-relaxed text-sm mb-3">{footerAbout}</p>
                        {socialLinks.length > 0 && (
                            <div className="flex items-center gap-2 mb-4 justify-start lg:justify-start">
                              {socialLinks.map((social) => (
                                <a key={social.key} href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label}
                                  className="w-9 h-9 rounded-full bg-[#F68B1E] text-white flex items-center justify-center text-muted-foreground  hover:text-primary-foreground transition-all duration-200">
                                  <social.icon className="w-4 h-4" />
                                </a>
                              ))}
                            </div>
                          )}
                      </div>
    
                      
                    </div>
    
                    <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-6">
                      <div>
                        <h6 className="text-slate-900 text-base font-semibold mb-4">Quick Links</h6>
                        <ul className="space-y-2">
                          {quickLinks.map((link) => (
                              <li key={link.label}>
                                <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{link.label}</Link>
                              </li>
                            ))}
                        </ul>
                      </div>
    
                      <div>
                        <h6 className="text-slate-900 text-base font-semibold mb-4">Support</h6>
                        <ul className="space-y-2">
                          
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
                              <Link to="/support" className="text-sm text-muted-foreground hover:text-primary transition-colors">Help Center</Link>
                            </li>
                            <li>
                              <Link to="/support" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contact Us</Link>
                            </li>
                        </ul>
                      </div>
    
                      <div>
                        <h6 className="text-slate-900 text-base font-semibold mb-4">Contact</h6>
                        <ul className="space-y-2">
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
                    </div>
                  </div>
    
                  <div className="flex items-center justify-between flex-wrap gap-6">
                    <p className="text-slate-900 text-sm">{copyrightText}</p>
    
                    <div className="flex flex-wrap gap-3">
                      {/* <a href='javascript:void(0)'>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24">
                          <g fill="none" fill-rule="evenodd">
                            <path fill="#E7A83A" d="M2 17a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3H2Z" />
                            <path fill="#3A6FA3" d="M22 7a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3h20Z" />
                            <path fill="#F6F6F6" d="M2 17h20V7H2z" />
                            <path fill="#1D5B99" d="M13.08 14.6c-.94 0-1.57-.3-2.02-.57l.64-.97c.4.22.72.48 1.44.48.23 0 .46-.06.59-.28.18-.32-.05-.5-.57-.8l-.26-.16c-.77-.53-1.1-1.03-.74-1.9.23-.57.85-1 1.86-1 .7 0 1.36.3 1.74.6l-.73.86c-.37-.3-.68-.45-1.04-.45-.28 0-.5.1-.57.25-.14.28.05.47.45.72l.31.2c.94.59 1.16 1.21.93 1.79-.4 1-1.2 1.22-2.03 1.22Zm5.4-3.06c0-.36-.02-.86 0-1.16h-.02c-.08.24-.43.98-.58 1.34l-.5 1.09h1.18l-.07-1.27Zm.16 2.91-.04-.73h-1.67l-.34.73h-1.45l2.63-4.93h1.78l.45 4.93h-1.36ZM8.24 9.52l-1.2 2.09c-.3.55-.48.83-.57 1.17h-.02c.02-.44-.04-.98-.04-1.28l-.14-1.98H4.02L4 9.65c.58 0 .92.29 1.02.88l.43 3.92h1.39l2.8-4.93h-1.4Zm.6 4.93 1.5-4.94h1.34l-1.5 4.94H8.84Z" />
                          </g>
                        </svg>
                      </a>
                      <a href='javascript:void(0)'>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24">
                          <g fill="none" fill-rule="evenodd">
                            <path fill="#000" d="M22 13V7a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-4Z" />
                            <path fill="#F16122" d="M9.84 15.93h4.32V8.07H9.84z" />
                            <path fill="#E91D25" d="M10.11 12A5 5 0 0 1 12 8.07 4.89 4.89 0 0 0 8.94 7 4.97 4.97 0 0 0 4 12c0 2.76 2.21 5 4.94 5 1.16 0 2.22-.4 3.06-1.07A5.01 5.01 0 0 1 10.11 12" />
                            <path fill="#F79E1B" d="M20 12c0 2.76-2.21 5-4.94 5-1.16 0-2.22-.4-3.06-1.07a5.01 5.01 0 0 0 0-7.86A4.89 4.89 0 0 1 15.06 7 4.97 4.97 0 0 1 20 12" />
                          </g>
                        </svg>
                      </a>
                      <a href='javascript:void(0)'>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24">
                          <g fill="none" fill-rule="evenodd">
                            <path fill="#F6F6F6" d="M22 13V7a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-4Z" />
                            <path fill="#231F20" d="m14.23 10.45.73 1.85.74-1.85h.59l-1.2 2.82h-.28l-1.17-2.82h.59Zm-6.72-.04c.3 0 .58.1.8.3l-.27.37c-.14-.16-.27-.22-.44-.22-.23 0-.4.13-.4.3 0 .15.1.23.42.35.61.22.8.42.8.86 0 .53-.4.9-.96.9-.4 0-.7-.16-.95-.52l.35-.34c.12.24.33.37.58.37.24 0 .42-.17.42-.39a.33.33 0 0 0-.16-.28 2.23 2.23 0 0 0-.37-.16c-.5-.18-.68-.38-.68-.75 0-.45.37-.8.86-.8Zm2.54-.02c.23 0 .42.05.66.17v.63a.9.9 0 0 0-1.58.64c0 .55.39.95.93.95.24 0 .43-.1.65-.3v.63c-.25.11-.44.16-.68.16-.81 0-1.45-.63-1.45-1.44 0-.8.65-1.44 1.47-1.44Zm-6 .06c.87 0 1.48.57 1.48 1.38a1.38 1.38 0 0 1-1.49 1.37h-.78v-2.75Zm2.26 0v2.75h-.54v-2.75h.54Zm11.74 0v.47h-.99v.61h.95V12h-.95v.74h.99v.46h-1.52v-2.75h1.52Zm1.15 0c.62 0 .97.3.97.81 0 .43-.22.7-.62.78l.86 1.16h-.66l-.74-1.1h-.07v1.1h-.53v-2.75Zm-15.26.47H3.8v1.82h.14c.35 0 .57-.07.74-.22.18-.17.3-.43.3-.7a.92.92 0 0 0-.3-.68c-.18-.16-.4-.22-.74-.22Zm15.17-.03h-.17v.83h.16c.34 0 .52-.15.52-.43 0-.26-.18-.4-.51-.4Z" />
                            <path fill="#F16122" d="M9.11 19.92h9.9a3 3 0 0 0 3-3v-4s-2.6 4.86-12.9 7m3.23-6.62a1.46 1.46 0 1 1 0-2.93 1.46 1.46 0 0 1 0 2.93Z" />
                          </g>
                        </svg>
                      </a>
                      <a href='javascript:void(0)'>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24">
                          <path fill="#ed171f" fill-rule="evenodd" d="M5.306 20H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4.026l-3.72 16Z" />
                          <path fill="#006a65" fill-rule="evenodd" d="M15.325 4H19a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-7.395l3.72-16Z" />
                          <path fill="#082f67" fill-rule="evenodd" d="M9.026 4h6.3l-3.721 16h-6.3l3.72-16z" />
                          <path fill="#fff" d="M16.595 15.573h-.187l.696-2.301h.231l.073-.237.007.263c-.007.163.12.308.457.284h.39l.133-.444h-.146c-.083 0-.122-.021-.118-.066l-.008-.27h-.72v.002c-.23.005-.93.023-1.072.06a1.26 1.26 0 0 0-.35.174l.07-.239h-.675l-.141.473-.706 2.337h-.136l-.135.44h1.345l-.045.148h.662l.044-.148h.187l.144-.476Zm-.841.007h-.538l.155-.517h.538l-.155.517Zm.3-1s-.168.021-.278.047c-.11.032-.314.137-.314.137l.184-.612h.539l-.131.428Zm-.01-.84c-.109.03-.309.12-.309.12l.179-.588h.537l-.13.428s-.166.011-.276.04Z" />
                          <path fill="#fff" d="M17.05 14.151h.775l-.112.36h-.785l-.118.396h.687l-.52.732a.214.214 0 0 1-.106.089.304.304 0 0 1-.14.04h-.19l-.132.432h.5a.609.609 0 0 0 .526-.272l.357-.49.077.497a.237.237 0 0 0 .127.17c.05.023.102.066.176.072.077.004.133.008.17.008h.246l.147-.485h-.097c-.055 0-.15-.008-.167-.027-.015-.021-.017-.053-.025-.102l-.077-.498h-.318l.138-.166h.786l.12-.396h-.726l.113-.36h.724l.135-.445h-2.158l-.133.445Zm-6.549 1.529.18-.602h.744l.136-.449h-.745l.114-.369h.727l.135-.434h-1.82l-.132.434h.414l-.11.37h-.416l-.137.456h.413l-.24.797c-.032.104.014.144.045.194.031.048.062.08.133.097a.812.812 0 0 0 .19.026h.84l.15-.496-.373.052c-.072 0-.27-.01-.248-.076Zm.084-2.882-.187.34a.395.395 0 0 1-.11.142c-.029.018-.085.025-.168.025h-.099l-.132.437h.327a.74.74 0 0 0 .336-.087c.061-.033.078-.014.125-.06l.11-.095h1.02l.136-.454h-.746l.13-.248h-.742Zm1.506 2.889c-.017-.024-.004-.067.022-.158l.28-.924h.99c.145-.001.249-.004.317-.01a.65.65 0 0 0 .238-.08.44.44 0 0 0 .175-.16 1.33 1.33 0 0 0 .17-.387l.35-1.167-1.028.005s-.317.047-.457.1c-.14.057-.34.217-.34.217l.092-.32h-.636l-.89 2.953a1.719 1.719 0 0 0-.058.247c-.002.054.068.106.114.147.052.04.13.035.206.04.08.007.193.01.348.01h.49l.149-.506-.437.04a.114.114 0 0 1-.095-.047Zm.69-2.4h1.05l-.075.248s-.496-.005-.575.01c-.348.061-.552.247-.552.247l.152-.506Zm-.21.695h1.043l-.067.207c-.01.005-.031-.01-.138.004h-.901l.063-.21Z" />
                          <path fill="#fff" d="M13.572 14.884a.13.13 0 0 1-.042.065.217.217 0 0 1-.106.018h-.15l.009-.252h-.617l-.024 1.235c-.002.089.006.141.07.182.067.053.268.059.539.059h.387l.139-.463-.337.02-.111.004a.113.113 0 0 1-.047-.027c-.014-.015-.039-.005-.034-.096l.003-.317.352-.014a.46.46 0 0 0 .342-.12c.066-.057.088-.124.114-.21l.058-.281h-.485l-.06.197Zm-7.449-6.38c-.587.007-.759 0-.815-.012-.022.1-.418 1.928-.42 1.929-.085.37-.146.634-.357.803a.642.642 0 0 1-.42.147c-.26 0-.413-.13-.44-.375l-.004-.083.08-.499s.416-1.665.49-1.885l.007-.025c-.81.008-.954 0-.963-.012a3.86 3.86 0 0 0-.026.12l-.425 1.876-.037.16-.07.52c0 .154.031.281.091.388.194.338.746.389 1.058.389.402 0 .778-.086 1.033-.241.442-.262.559-.672.662-1.034l.048-.186s.428-1.73.502-1.955a.092.092 0 0 1 .006-.025ZM7.581 9.9c-.103 0-.292.024-.461.107-.063.032-.12.069-.181.104l.054-.2-.03-.033c-.36.074-.44.083-.772.13l-.027.018c-.04.32-.073.56-.216 1.188-.054.231-.111.465-.168.697l.016.028a8.99 8.99 0 0 1 .739-.013l.024-.025c.037-.193.042-.238.126-.627.038-.186.12-.592.16-.736.074-.034.146-.068.216-.068.165 0 .146.145.14.203a7.443 7.443 0 0 1-.13.684l-.041.174c-.028.13-.06.256-.09.383l.013.025a8.67 8.67 0 0 1 .724-.013l.034-.025c.051-.301.066-.381.158-.82l.047-.2c.09-.393.135-.594.066-.756-.072-.182-.244-.226-.4-.226Zm1.627.412c-.178.033-.292.055-.405.072l-.392.057-.015.013-.013.01c-.016.128-.03.239-.052.37a8.435 8.435 0 0 1-.104.507c-.038.169-.06.228-.081.286-.021.06-.046.118-.09.284l.01.014.01.014c.16-.007.266-.013.374-.014.11-.003.22 0 .393.001l.016-.012.015-.013c.026-.15.03-.19.045-.264.016-.077.04-.185.106-.474.03-.137.063-.272.095-.41l.1-.41-.005-.016-.007-.015Zm.982 1.658c.329 0 .665-.091.916-.359.196-.217.285-.54.316-.673.1-.442.023-.648-.076-.774-.15-.19-.413-.253-.687-.253-.165 0-.557.017-.864.3-.22.204-.322.48-.384.745-.061.27-.133.758.315.939.138.058.336.074.465.074Zm-.024-.993c.075-.335.165-.615.392-.615.179 0 .19.209.113.544-.016.074-.08.351-.17.47-.06.085-.133.138-.214.138-.023 0-.165 0-.167-.21-.002-.105.02-.212.046-.327Zm6.429.018c-.062.266-.133.753.312.927.14.06.27.077.398.072.136-.008.262-.08.379-.178-.011.042-.02.083-.032.124l.022.026c.32-.013.42-.013.766-.01l.031-.025c.05-.297.099-.587.231-1.156.063-.272.128-.543.194-.814l-.011-.03c-.359.067-.454.08-.798.13l-.026.021-.013.094a.479.479 0 0 0-.25-.22c-.152-.06-.513.017-.82.298-.218.203-.322.477-.383.741Zm.754.017c.075-.328.164-.607.392-.607.148 0 .22.146.199.385-.012.052-.021.099-.036.16-.023.102-.051.202-.077.303a.662.662 0 0 1-.078.158.396.396 0 0 1-.28.136c-.022 0-.163 0-.168-.209 0-.102.02-.21.048-.326Zm-5.109.914.026-.025c.037-.193.042-.238.124-.627.04-.186.122-.592.162-.736.074-.034.146-.068.217-.068.164 0 .145.145.139.203a7.19 7.19 0 0 1-.13.684l-.04.174c-.03.13-.063.256-.092.383l.013.025a8.7 8.7 0 0 1 .723-.013l.036-.025c.05-.301.064-.381.158-.82l.045-.2c.09-.393.136-.594.069-.756-.074-.182-.247-.226-.404-.226a1.12 1.12 0 0 0-.46.108c-.061.032-.121.069-.18.104l.052-.2-.029-.033c-.359.074-.44.083-.772.13l-.026.018c-.04.32-.074.56-.216 1.188-.055.231-.11.465-.167.697l.016.028c.34-.017.441-.017.737-.013Zm2.472.013c.02-.103.148-.715.148-.715s.108-.45.114-.466c0 0 .033-.046.068-.064h.05c.466 0 .994 0 1.407-.305.28-.209.475-.517.56-.89.023-.092.039-.202.039-.311a.649.649 0 0 0-.113-.396c-.21-.296-.63-.3-1.115-.303l-.239.003c-.62.007-.87.004-.971-.008l-.026.126-.222 1.032-.557 2.293c.542-.006.764-.006.857.004Zm.412-1.83.236-1.025.007-.052.004-.04.095.01.499.043c.192.073.27.266.215.517a.754.754 0 0 1-.389.514c-.158.079-.35.085-.549.085h-.127l.01-.051Zm6.152-.181-.028-.03a8.56 8.56 0 0 1-.744.125l-.024.024a.113.113 0 0 0-.003.015l-.002-.005c-.243.56-.235.44-.433.88l-.002-.055-.049-.954-.031-.03c-.37.07-.38.082-.723.125l-.027.024c-.003.012-.004.025-.006.038l.003.005c.043.22.033.17.075.516.02.169.047.34.067.507.034.28.053.42.093.846-.23.383-.286.528-.507.864l-.156.25c-.019.026-.035.044-.057.05a.244.244 0 0 1-.104.016h-.087l-.129.43.444.008c.26-.001.424-.124.512-.287l.28-.477h-.006l.03-.034c.187-.403 1.614-2.85 1.614-2.85ZM9.212 9.755c-.163-.095-.445-.065-.637.067-.192.13-.213.314-.053.41.161.093.445.066.636-.067.19-.132.214-.315.054-.41Z" />
                        </svg>
                      </a>
                      <a href='javascript:void(0)'>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24">
                          <path fill="#F1F1F1" d="M22 13V7c0-1.654-1.346-3-3-3H5C3.346 4 2 5.346 2 7v10c0 1.654 1.346 3 3 3h14c1.654 0 3-1.346 3-3v-4Z" />
                          <path fill="#5086EB" d="M15.93 16.36c1.081-1.001 1.7-2.48 1.7-4.229 0-.42-.037-.822-.107-1.209H12.12v2.216h3.112a2.665 2.665 0 0 1-1.155 1.785l1.853 1.437Zm0 0Z" />
                          <path fill="#58A45C" d="M15.93 16.36Zm-1.852-1.437c-.516.347-1.18.551-1.957.551-1.5 0-2.773-1.011-3.23-2.374l-1.91 1.483a5.752 5.752 0 0 0 5.14 3.167c1.553 0 2.858-.51 3.808-1.39l-1.851-1.437Z" />
                          <path fill="#F0BB42" d="M8.712 12c0-.382.064-.752.18-1.1l-1.91-1.483A5.72 5.72 0 0 0 6.37 12c0 .93.22 1.806.611 2.583l1.91-1.482a3.476 3.476 0 0 1-.18-1.1Z" />
                          <path fill="#D74F3F" d="M12.121 6.25a5.753 5.753 0 0 0-5.14 3.167l1.91 1.483c.457-1.363 1.73-2.374 3.23-2.374.848 0 1.608.292 2.207.863l1.642-1.64c-.997-.93-2.297-1.499-3.849-1.499Z" />
                        </svg>
                      </a> */}
                    </div>
                  </div>
                </div>
              </div>
            </footer>

    </>
  );
}
