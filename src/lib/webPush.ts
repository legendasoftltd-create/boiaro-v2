import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

interface WebPushConfig {
  configured: boolean;
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
}

let cachedApp: FirebaseApp | null = null;

async function fetchConfig(): Promise<WebPushConfig> {
  const res = await fetch(`${API_BASE}/api/v1/push/web-config`);
  return res.json();
}

/** True if this browser can support web push at all (Notification API + Service Worker + IndexedDB). */
export async function isWebPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * Requests notification permission (if not already decided) and returns an
 * FCM web push token, or null if unsupported/not configured/denied.
 */
export async function requestWebPushToken(): Promise<string | null> {
  if (!(await isWebPushSupported())) return null;

  const config = await fetchConfig();
  if (!config.configured || !config.vapidKey) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  if (!cachedApp) {
    cachedApp = getApps()[0] ?? initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(cachedApp);

  const token = await getToken(messaging, {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration,
  });

  return token || null;
}

/** Subscribe to foreground (tab open & focused) push messages. Returns an unsubscribe fn. */
export async function onForegroundPush(
  callback: (payload: { title?: string; body?: string; link?: string }) => void
): Promise<() => void> {
  if (!cachedApp) return () => {};
  const messaging = getMessaging(cachedApp);
  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title,
      body: payload.notification?.body,
      link: payload.data?.link,
    });
  });
}

export function getWebPushPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}
