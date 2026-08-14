import { prisma } from "./prisma.js";

/**
 * The only writer for the SystemLog table — AdminSystemLogs.tsx and the
 * system-alerts endpoints were built as real, working readers/UI over this
 * table, but nothing ever called this before, so every actual error only
 * ever reached console/PM2 output, invisible to that page. Dedupes by a
 * crude module+message fingerprint so a repeating error accumulates an
 * occurrence count instead of flooding the table with duplicate rows.
 */
export async function logSystemError(
  module: string,
  error: unknown,
  opts?: { userId?: string | null; level?: "warn" | "error" | "critical"; extra?: Record<string, unknown> }
): Promise<void> {
  try {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    const stack = error instanceof Error ? error.stack?.slice(0, 4000) : undefined;
    const fingerprint = `${module}:${message}`.slice(0, 500);
    const level = opts?.level ?? "error";

    const existing = await prisma.systemLog.findUnique({ where: { fingerprint }, select: { metadata: true } });
    const prevMeta = (existing?.metadata as Record<string, unknown> | null) ?? {};
    const occurrenceCount = (typeof prevMeta.occurrenceCount === "number" ? prevMeta.occurrenceCount : 0) + 1;

    await prisma.systemLog.upsert({
      where: { fingerprint },
      create: {
        module,
        level,
        message,
        fingerprint,
        user_id: opts?.userId ?? null,
        metadata: { stack, occurrenceCount: 1, ...opts?.extra } as any,
      },
      update: {
        level,
        user_id: opts?.userId ?? null,
        metadata: { stack, occurrenceCount, lastSeenAt: new Date().toISOString(), ...opts?.extra } as any,
      },
    });
  } catch (loggingErr) {
    // Never let logging itself break the request that triggered it.
    console.error("[systemLog] failed to record error:", loggingErr);
  }
}
