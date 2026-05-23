import admin from "firebase-admin";
import { prisma } from "./prisma.js";

// ─── Cached app state ────────────────────────────────────────────────────────
let cachedApp: admin.app.App | null = null;
let cachedJson: string | null = null;

async function getServiceAccountJson(): Promise<string | null> {
  // DB setting takes priority over env var
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: "firebase_service_account_json" },
    });
    if (row?.value) return row.value;
  } catch {
    // DB unavailable — fall through to env
  }
  return process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? null;
}

async function getFirebaseApp(): Promise<admin.app.App | null> {
  const json = await getServiceAccountJson();
  if (!json) return null;

  // Re-init only when credentials actually changed
  if (cachedApp && cachedJson === json) return cachedApp;

  try {
    // Tear down previous app before creating a new one
    if (cachedApp) {
      await cachedApp.delete();
      cachedApp = null;
      cachedJson = null;
    }

    const serviceAccount = JSON.parse(json);
    const appName = `boiaro-${Date.now()}`;
    cachedApp = admin.initializeApp(
      { credential: admin.credential.cert(serviceAccount) },
      appName
    );
    cachedJson = json;
    return cachedApp;
  } catch (err) {
    console.error("[firebase] Failed to initialize:", (err as Error).message);
    cachedApp = null;
    cachedJson = null;
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  imageUrl?: string | null;
  notificationId?: string;
}

/**
 * Send FCM push to a list of device tokens.
 * Silently no-ops when Firebase is not configured.
 * Returns count of successful deliveries.
 */
export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<number> {
  if (!tokens.length) return 0;
  const app = await getFirebaseApp();
  if (!app) return 0;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: payload.title,
      body: payload.message,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    },
    data: {
      type: payload.type ?? "general",
      ...(payload.link ? { link: payload.link } : {}),
      ...(payload.notificationId ? { notification_id: payload.notificationId } : {}),
    },
    android: {
      priority: "high",
      notification: { sound: "default" },
    },
    apns: {
      payload: { aps: { sound: "default" } },
    },
  };

  try {
    const response = await admin.messaging(app).sendEachForMulticast(message);
    return response.successCount;
  } catch (err) {
    console.error("[firebase] sendPushToTokens error:", err);
    return 0;
  }
}

/**
 * Validate credentials by sending a dry-run message to a dummy token.
 * Returns { ok: true } if credentials are valid (even if the token itself is invalid).
 * Returns { ok: false, error: string } for auth/config failures.
 */
export async function testFirebaseCredentials(): Promise<{ ok: boolean; error?: string }> {
  const app = await getFirebaseApp();
  if (!app) return { ok: false, error: "Firebase is not configured" };

  try {
    await admin.messaging(app).send(
      { token: "test-invalid-token-for-credential-check", notification: { title: "test" } },
      true // dry_run
    );
    return { ok: true };
  } catch (err: any) {
    const code: string = err?.errorInfo?.code ?? err?.code ?? "";
    // These codes mean credentials are valid — the failure is just about the token
    if (
      code.includes("registration-token-not-registered") ||
      code.includes("invalid-registration-token") ||
      code.includes("invalid-argument")
    ) {
      return { ok: true };
    }
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

/** Force the cached app to reinitialize on next use (call after saving new credentials). */
export function invalidateFirebaseCache(): void {
  if (cachedApp) {
    cachedApp.delete().catch(() => {});
    cachedApp = null;
    cachedJson = null;
  }
}

export async function isFirebaseConfigured(): Promise<boolean> {
  const json = await getServiceAccountJson();
  return Boolean(json);
}
