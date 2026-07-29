import fs from "fs";
import { prisma } from "./prisma.js";

// Server-rendered so the literal <script> tags are present in the initial HTML
// response — tools that check "view source" (Google's own install verifier,
// SEO auditors, GTM's preview) don't run JS, so a client-injected-only tag is
// invisible to them even though it fires correctly for real visitors.
const GA4_ID_RE = /^G-[A-Z0-9]+$/;
const GTM_ID_RE = /^GTM-[A-Z0-9]+$/;

const CACHE_TTL_MS = 60_000;
let cache: { html: string; expiresAt: number } | null = null;

function escAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

async function buildInjectedHtml(templatePath: string): Promise<string> {
  const template = fs.readFileSync(templatePath, "utf-8");

  const rows = await prisma.platformSetting.findMany({
    where: {
      key: {
        in: [
          "analytics_ga4_enabled", "analytics_ga4_measurement_id",
          "analytics_gtm_enabled", "analytics_gtm_container_id",
        ],
      },
    },
  });
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.key] = r.value; });

  const ga4Id = (map.analytics_ga4_measurement_id || "").trim();
  const ga4Active = map.analytics_ga4_enabled === "true" && GA4_ID_RE.test(ga4Id);
  const gtmId = (map.analytics_gtm_container_id || "").trim();
  const gtmActive = map.analytics_gtm_enabled === "true" && GTM_ID_RE.test(gtmId);

  let headInject = "";
  let bodyInject = "";

  if (gtmActive) {
    const id = escAttr(gtmId);
    headInject += `<script data-analytics-marker="gtm-${id}">(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');</script>\n`;
    bodyInject += `<noscript><iframe data-analytics-marker="gtm-noscript-${id}" src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n`;
  }
  if (ga4Active) {
    const id = escAttr(ga4Id);
    headInject += `<!-- Google tag (gtag.js) -->\n<script async data-analytics-marker="ga4-${id}" src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', '${id}');\n</script>\n`;
  }

  let html = template;
  if (headInject) html = html.replace("</head>", `${headInject}</head>`);
  if (bodyInject) html = html.replace(/<body[^>]*>/, (m) => `${m}\n${bodyInject}`);
  return html;
}

/** Returns index.html with GA4/GTM tags injected per current admin settings, cached briefly to avoid a DB hit on every page request. */
export async function getAnalyticsInjectedHtml(templatePath: string): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.html;
  const html = await buildInjectedHtml(templatePath);
  cache = { html, expiresAt: now + CACHE_TTL_MS };
  return html;
}
