import admin from "firebase-admin";

let app: admin.app.App | null = null;

function getApp(): admin.app.App | null {
  if (app) return app;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return app;
  } catch {
    console.error("[firebase] Failed to initialize — check FIREBASE_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

export interface PushPayload {
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  imageUrl?: string | null;
  notificationId?: string;
}

/**
 * Send FCM push notifications to a list of device tokens.
 * Silently no-ops if Firebase is not configured.
 * Returns count of successful deliveries.
 */
export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<number> {
  const firebaseApp = getApp();
  if (!firebaseApp || !tokens.length) return 0;

  const messaging = admin.messaging(firebaseApp);

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
      payload: {
        aps: { sound: "default" },
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    return response.successCount;
  } catch (err) {
    console.error("[firebase] sendPushToTokens error:", err);
    return 0;
  }
}

export const isFirebaseConfigured = () => Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
