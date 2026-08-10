import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { mintToken, DEFAULT_CAN_PUBLISH } from "../../routers/studio.js";
import { uploadWithFallback } from "../../lib/s3.js";

export const studioRestRouter = Router();

const paramsSchema = z.object({ token: z.string().min(1) });

// Mirrors liveRecorder.ts's local-fallback config exactly (same uploads
// dir/base URL convention) so a WAV master falls back the same way an
// MP3 catch-up recording does when S3 isn't configured.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../../../uploads");
const BASE_URL = (process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");
const fallbackConfig = { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL };

// POST /api/v1/studio/join/:token
// Redeems a Studio invite link: validates it, records the participant, and
// mints a role-scoped LiveKit token. Deliberately a REST route rather than
// tRPC — a fresh guest hitting a shared link has no prior StudioParticipant
// row yet, so this is the one Studio entry point that only needs login, not
// existing room membership.
studioRestRouter.post("/join/:token", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { token } = paramsSchema.parse(req.params);
    const userId = req.auth.userId!;

    const invite = await prisma.studioInviteLink.findUnique({ where: { token } });
    if (!invite) {
      res.status(404).json({ message: "Invite link not found" });
      return;
    }
    if (invite.used_at) {
      res.status(410).json({ message: "This invite link has already been used" });
      return;
    }
    if (invite.expires_at < new Date()) {
      res.status(410).json({ message: "This invite link has expired" });
      return;
    }

    const session = await prisma.studioSession.findUnique({ where: { id: invite.studio_session_id } });
    if (!session || session.status === "ended") {
      res.status(410).json({ message: "This studio session has ended" });
      return;
    }

    await prisma.$transaction([
      prisma.studioInviteLink.update({ where: { id: invite.id }, data: { used_at: new Date() } }),
      prisma.studioParticipant.upsert({
        where: { studio_session_id_user_id: { studio_session_id: invite.studio_session_id, user_id: userId } },
        create: { studio_session_id: invite.studio_session_id, user_id: userId, role: invite.role },
        update: { role: invite.role, left_at: null },
      }),
    ]);

    const canPublish = DEFAULT_CAN_PUBLISH[invite.role] ?? false;
    const jwt = await mintToken(userId, session.room_name, canPublish);

    res.json({
      token: jwt,
      url: process.env.LIVEKIT_URL,
      role: invite.role,
      sessionId: session.id,
      roomName: session.room_name,
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// Same memoryStorage/size-limit convention as the app's other media uploads
// (see uploadMedia in server/src/index.ts). Multipart bodies are exempt from
// the global "Content-Type must be application/json" mutation guard, so this
// needs no changes to shared middleware.
const masterUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

// POST /api/v1/studio/internal/master-ready
// Called by the Bridge Relay (studio-bridge/) once it's done writing a
// session's WAV master — service-to-service, not a user session, so this is
// gated by a shared secret header rather than requireAuth. The Bridge Relay
// and this app run on separate hosts in production, so the file itself is
// pushed as multipart form data rather than a local path being handed over.
// Uploads via the same uploadWithFallback path liveRecorder.ts already uses
// for the (separate, lower-quality) MP3 catch-up recording.
studioRestRouter.post("/internal/master-ready", masterUpload.single("file"), async (req, res) => {
  const secret = req.header("X-Studio-Internal-Secret");
  if (!secret || secret !== process.env.STUDIO_BRIDGE_INTERNAL_SECRET) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const roomName = z.string().min(1).parse(req.body.roomName);
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "Missing file" });
      return;
    }

    const session = await prisma.studioSession.findUnique({ where: { room_name: roomName } });
    if (!session) {
      res.status(404).json({ message: "Studio session not found for room" });
      return;
    }

    await prisma.studioSession.update({
      where: { id: session.id },
      data: { master_recording_status: "processing" },
    });

    if (file.size < 10_000) {
      // Basically empty — mirrors liveRecorder.ts's same guard against publishing silence.
      await prisma.studioSession.update({ where: { id: session.id }, data: { master_recording_status: null } });
      res.json({ ok: true, skipped: "empty" });
      return;
    }

    const result = await uploadWithFallback(
      file.buffer,
      `${session.id}-master.wav`,
      "audio/wav",
      { hint: "audio", folder: "studio-masters" },
      fallbackConfig
    );

    await prisma.studioSession.update({
      where: { id: session.id },
      data: { master_recording_url: result.url, master_recording_status: "completed" },
    });

    res.json({ ok: true, url: result.url });
  } catch (error) {
    sendHttpError(res, error);
  }
});
