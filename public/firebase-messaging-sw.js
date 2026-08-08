/* eslint-disable no-undef */
// Firebase Cloud Messaging service worker — handles push notifications
// received while the BoiAro tab is not in the foreground.
//
// Config is fetched at runtime from /api/v1/push/web-config rather than
// hardcoded here, so it stays in sync with whatever the admin has saved
// in Admin > Push Settings (no rebuild needed when credentials change).

importScripts("https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function init() {
  try {
    const res = await fetch("/api/v1/push/web-config");
    const config = await res.json();
    if (!config.configured) return;

    firebase.initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });

    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || "BoiAro";
      const body = payload.notification?.body || "";
      const link = payload.data?.link || "/";
      const image = payload.notification?.image;
      self.registration.showNotification(title, {
        body,
        icon: "/favicon-64.png",
        badge: "/favicon-32.png",
        ...(image ? { image } : {}),
        data: { link },
      });
    });
  } catch (err) {
    console.error("[firebase-messaging-sw] init failed", err);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) {
        existing.navigate(link);
        return existing.focus();
      }
      return self.clients.openWindow(link);
    })
  );
});

init();
