import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAnalyticsConfig } from "@/hooks/useAnalyticsConfig";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

function loadScript(src: string, marker: string): Promise<void> {
  return new Promise(resolve => {
    if (document.querySelector(`script[data-analytics-marker="${marker}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.analyticsMarker = marker;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

function injectGtm(containerId: string) {
  if (document.querySelector(`script[data-analytics-marker="gtm-${containerId}"]`)) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const s = document.createElement("script");
  s.async = true;
  s.dataset.analyticsMarker = `gtm-${containerId}`;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
  document.head.appendChild(s);

  if (!document.querySelector(`iframe[data-analytics-marker="gtm-noscript-${containerId}"]`)) {
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${containerId}`;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    iframe.dataset.analyticsMarker = `gtm-noscript-${containerId}`;
    const noscript = document.createElement("noscript");
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);
  }
}

async function injectGa4(measurementId: string) {
  // The server injects the same marker into index.html when GA4 is enabled
  // (see server/src/lib/analyticsHtml.ts) — skip re-configuring in that case,
  // it would otherwise double-count the initial page_view.
  const alreadyServerRendered = !!document.querySelector(`script[data-analytics-marker="ga4-${measurementId}"]`);
  await loadScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`, `ga4-${measurementId}`);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) { window.dataLayer.push(args); };
  if (!alreadyServerRendered) {
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: true });
  }
}

/** Mounted once at the app root. Loads GA4/GTM only when the admin has enabled and configured them, then tracks SPA route changes. */
export function AnalyticsScripts() {
  const { config, isLoading } = useAnalyticsConfig();
  const location = useLocation();
  const initialized = useRef(false);
  const firstRoute = useRef(true);

  useEffect(() => {
    if (isLoading || initialized.current) return;
    initialized.current = true;

    if (config.gtmEnabled && config.gtmContainerId) {
      injectGtm(config.gtmContainerId);
    }
    if (config.ga4Enabled && config.ga4MeasurementId) {
      injectGa4(config.ga4MeasurementId);
    }
  }, [isLoading, config.gtmEnabled, config.gtmContainerId, config.ga4Enabled, config.ga4MeasurementId]);

  useEffect(() => {
    if (!initialized.current) return;
    // Skip the route the app mounted on — the initial gtag config / GTM load already accounts for it.
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    const pagePath = location.pathname + location.search;

    if (config.ga4Enabled && config.ga4MeasurementId && typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
    if (config.gtmEnabled && config.gtmContainerId) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "page_view", page_path: pagePath, page_location: window.location.href });
    }
  }, [location.pathname, location.search, config.ga4Enabled, config.ga4MeasurementId, config.gtmEnabled, config.gtmContainerId]);

  return null;
}
