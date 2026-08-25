import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

/**
 * Handles a Universal Link/App Link (https://boiaro.com/...) tapped outside
 * the app — from another app, a push notification, search results, etc. —
 * while the native app is already running or getting launched by it.
 * `capacitor.config.ts`'s `server.url` already points the whole webview at
 * boiaro.com, so the incoming URL is just a path in the same React app;
 * this only needs to hand that path to the router, not load a new screen.
 *
 * No-op on web — App Links only fire this event inside the native shell.
 */
export function useDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    let cancelled = false;

    import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      App.addListener("appUrlOpen", (event) => {
        try {
          const url = new URL(event.url);
          navigate(`${url.pathname}${url.search}${url.hash}`);
        } catch {
          // Malformed or non-http(s) URL — nothing sensible to navigate to.
        }
      }).then((handle) => {
        removeListener = () => handle.remove();
      });
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [navigate]);
}
