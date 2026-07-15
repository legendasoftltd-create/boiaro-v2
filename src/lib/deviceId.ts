import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";

const WEB_DEVICE_ID_KEY = "boiaro_device_id";

let cachedDeviceId: string | null = null;

/**
 * Returns a stable identifier for the current install (native) or browser
 * profile (web). Persists across app restarts; a native app reinstall or a
 * web user clearing site data will generate a fresh id — that's expected,
 * it just consumes a new device slot until the stale one is revoked.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  if (Capacitor.isNativePlatform()) {
    const { identifier } = await Device.getId();
    cachedDeviceId = identifier;
    return identifier;
  }

  const existing = localStorage.getItem(WEB_DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const generated = crypto.randomUUID();
  localStorage.setItem(WEB_DEVICE_ID_KEY, generated);
  cachedDeviceId = generated;
  return generated;
}

function coarseWebDeviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} on ${os}`;
}

export async function getDeviceDisplayInfo(): Promise<{ deviceName: string; platform: string }> {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    try {
      const info = await Device.getInfo();
      const deviceName = [info.model, info.operatingSystem, info.osVersion].filter(Boolean).join(" ");
      return { deviceName: deviceName || platform, platform };
    } catch {
      return { deviceName: platform, platform };
    }
  }
  return { deviceName: coarseWebDeviceName(), platform: "web" };
}
