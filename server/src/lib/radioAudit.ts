import { prisma } from "./prisma.js";

/**
 * Single audit trail for every radio moderation/admin action (message
 * deletes, mutes, force-ends, station edits, credential regenerate/revoke,
 * recording publish/unpublish, RJ approval transitions, etc) — reuses the
 * existing generic AuditLog table (the same one admin.ts's local audit()
 * helper writes to) rather than a bespoke log model, target_type="radio".
 */
export async function logRadioAction(
  actorId: string,
  action: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        actor_id: actorId,
        action,
        target_type: "radio",
        target_id: (metadata?.sessionId as string) ?? (metadata?.userId as string) ?? (metadata?.rjUserId as string) ?? undefined,
        details: metadata ? (metadata as any) : undefined,
      },
    })
    .catch(() => null);
}
