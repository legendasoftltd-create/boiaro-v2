import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export function isNativePushSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export function getNativePlatform(): "android" | "ios" | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === "ios" ? "ios" : "android";
}

/**
 * Requests OS push permission and registers with FCM/APNs.
 * Resolves with the device token via onToken, or null if denied/unsupported.
 * Call once per app session (e.g. after login) — safe to call repeatedly,
 * the OS no-ops if permission was already granted.
 */
export function registerNativePush(
  onToken: (token: string, platform: "android" | "ios") => void,
  onNotificationTap?: (link: string | undefined) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const platform = getNativePlatform() ?? "android";
  const listeners: Array<{ remove: () => void } | Promise<{ remove: () => void }>> = [];

  PushNotifications.requestPermissions().then((result) => {
    if (result.receive !== "granted") return;
    PushNotifications.register();
  });

  listeners.push(
    PushNotifications.addListener("registration", (token) => {
      onToken(token.value, platform);
    })
  );

  listeners.push(
    PushNotifications.addListener("registrationError", (err) => {
      console.error("[nativePush] registration error", err);
    })
  );

  // Foreground notification — the OS already shows it on Android by default;
  // this listener lets us refresh the in-app notification list immediately.
  listeners.push(
    PushNotifications.addListener("pushNotificationReceived", () => {
      window.dispatchEvent(new CustomEvent("boiaro:push-received"));
    })
  );

  // User tapped a delivered notification (foreground or background) — deep-link.
  listeners.push(
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = action.notification?.data?.link as string | undefined;
      onNotificationTap?.(link);
    })
  );

  return () => {
    Promise.all(listeners).then((resolved) => resolved.forEach((l) => l.remove()));
  };
}

export async function unregisterNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // best-effort cleanup
  }
}
