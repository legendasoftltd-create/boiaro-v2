import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";

export const pushRestRouter = Router();

// ── GET /api/v1/push/web-config ──────────────────────────────────────────────
// Public Firebase Web SDK config (no secrets — safe to expose to any client).
// Used by the browser (main thread) and the firebase-messaging-sw.js service
// worker to initialize Firebase Cloud Messaging for web push.
pushRestRouter.get("/web-config", async (_req, res) => {
  try {
    const keys = [
      "firebase_web_api_key",
      "firebase_web_auth_domain",
      "firebase_web_project_id",
      "firebase_web_storage_bucket",
      "firebase_web_messaging_sender_id",
      "firebase_web_app_id",
      "firebase_web_vapid_key",
      "firebase_push_enabled",
    ];
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const configured = Boolean(map["firebase_web_api_key"] && map["firebase_web_vapid_key"]);
    const pushEnabled = map["firebase_push_enabled"] !== "false";

    if (!configured || !pushEnabled) {
      res.json({ configured: false });
      return;
    }

    res.json({
      configured: true,
      apiKey: map["firebase_web_api_key"],
      authDomain: map["firebase_web_auth_domain"] || undefined,
      projectId: map["firebase_web_project_id"] || undefined,
      storageBucket: map["firebase_web_storage_bucket"] || undefined,
      messagingSenderId: map["firebase_web_messaging_sender_id"] || undefined,
      appId: map["firebase_web_app_id"] || undefined,
      vapidKey: map["firebase_web_vapid_key"],
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
