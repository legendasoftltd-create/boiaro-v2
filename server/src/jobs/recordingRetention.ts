import { prisma } from "../lib/prisma.js";
import { deleteFromS3 } from "../lib/s3.js";
import { getRadioSettingNumber } from "../lib/radioSettings.js";
import { logRadioAction } from "../lib/radioAudit.js";

/**
 * Runs daily (see jobs/index.ts). Enforces the recording retention policy:
 *   - Draft/rejected recordings older than radio_recording_draft_retention_days
 *     get auto-deleted (both the S3 object and the DB reference) — an admin
 *     never explicitly published them, so they don't get to live forever by
 *     default.
 *   - Published recordings only auto-delete if
 *     radio_recording_published_retention_days is explicitly set (empty =
 *     keep forever, the default).
 */
export async function runRecordingRetentionSweep(): Promise<{ draftsDeleted: number; publishedDeleted: number }> {
  const [draftDays, publishedDays] = await Promise.all([
    getRadioSettingNumber("radio_recording_draft_retention_days"),
    getRadioSettingNumber("radio_recording_published_retention_days"),
  ]);

  let draftsDeleted = 0;
  let publishedDeleted = 0;

  if (draftDays && draftDays > 0) {
    const threshold = new Date(Date.now() - draftDays * 24 * 60 * 60 * 1000);
    const stale = await prisma.liveSession.findMany({
      where: { recording_status: { in: ["draft", "rejected"] }, ended_at: { lt: threshold } },
      select: { id: true, recording_url: true, rj_user_id: true },
    });
    for (const s of stale) {
      if (s.recording_url) await deleteFromS3(s.recording_url).catch(() => null);
      await prisma.liveSession.update({
        where: { id: s.id },
        data: { recording_url: null, recording_status: "deleted", recording_file_size_bytes: null, recording_duration_seconds: null },
      });
      await logRadioAction(s.rj_user_id, "recording_auto_deleted_draft_retention", { sessionId: s.id });
      draftsDeleted++;
    }
  }

  if (publishedDays && publishedDays > 0) {
    const threshold = new Date(Date.now() - publishedDays * 24 * 60 * 60 * 1000);
    const stale = await prisma.liveSession.findMany({
      where: { recording_status: "published", recording_published_at: { lt: threshold } },
      select: { id: true, recording_url: true, rj_user_id: true },
    });
    for (const s of stale) {
      if (s.recording_url) await deleteFromS3(s.recording_url).catch(() => null);
      await prisma.liveSession.update({
        where: { id: s.id },
        data: { recording_url: null, recording_status: "deleted", recording_file_size_bytes: null, recording_duration_seconds: null },
      });
      await logRadioAction(s.rj_user_id, "recording_auto_deleted_published_retention", { sessionId: s.id });
      publishedDeleted++;
    }
  }

  return { draftsDeleted, publishedDeleted };
}
