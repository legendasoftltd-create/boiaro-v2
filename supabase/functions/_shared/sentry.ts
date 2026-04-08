/**
 * Lightweight error reporter for Edge Functions.
 * Uses Sentry HTTP API directly (no SDK needed in Deno).
 * Set SENTRY_DSN secret to enable.
 */

const DSN = Deno.env.get("SENTRY_DSN");

interface ErrorContext {
  functionName: string;
  userId?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

export async function captureException(error: unknown, ctx: ErrorContext) {
  console.error(`[${ctx.functionName}]`, error);

  if (!DSN) return;

  try {
    const parsed = parseDsn(DSN);
    if (!parsed) return;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const envelope = JSON.stringify({
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      server_name: "edge-functions",
      environment: Deno.env.get("ENVIRONMENT") || "production",
      release: Deno.env.get("APP_VERSION") || "0.1.0",
      transaction: ctx.functionName,
      tags: {
        function_name: ctx.functionName,
        action: ctx.action || "unknown",
      },
      user: ctx.userId ? { id: ctx.userId } : undefined,
      extra: ctx.extra,
      exception: {
        values: [
          {
            type: error instanceof Error ? error.constructor.name : "Error",
            value: message,
            stacktrace: stack
              ? { frames: parseStack(stack) }
              : undefined,
          },
        ],
      },
    });

    await fetch(
      `https://${parsed.host}/api/${parsed.projectId}/store/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=edge-fn/0.1, sentry_key=${parsed.publicKey}`,
        },
        body: envelope,
      }
    );
  } catch (e) {
    console.error("[sentry-edge] Failed to report:", e);
  }
}

function parseDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace("/", "");
    const host = url.host;
    return { publicKey, projectId, host };
  } catch {
    return null;
  }
}

function parseStack(stack: string) {
  return stack
    .split("\n")
    .slice(1, 10)
    .map((line) => {
      const match = line.match(/at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);
      if (match) {
        return {
          function: match[1],
          filename: match[2],
          lineno: parseInt(match[3]),
          colno: parseInt(match[4]),
        };
      }
      return { function: line.trim(), filename: "unknown", lineno: 0, colno: 0 };
    });
}
