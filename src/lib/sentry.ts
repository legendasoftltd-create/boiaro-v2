import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn("[Sentry] VITE_SENTRY_DSN not set — error monitoring disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || "development",
    release: import.meta.env.VITE_APP_VERSION || "0.1.0",

    // Performance
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],

    // Strip sensitive data
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      if (event.request?.data && typeof event.request.data === "string") {
        try {
          const parsed = JSON.parse(event.request.data);
          delete parsed.password;
          delete parsed.token;
          delete parsed.access_token;
          delete parsed.refresh_token;
          event.request.data = JSON.stringify(parsed);
        } catch {
          // not JSON, leave as-is
        }
      }
      return event;
    },

    // Ignore common noise
    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection captured",
      "Network request failed",
      /Loading chunk \d+ failed/,
    ],
  });
}

export function setSentryUser(user: { id: string; email?: string; role?: string } | null) {
  if (!SENTRY_DSN) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
    Sentry.setTag("user_role", user.role || "user");
  } else {
    Sentry.setUser(null);
  }
}

export { Sentry };
