import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type LogLevel = "warning" | "error" | "critical";

interface LogOptions {
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Generates a short fingerprint for dedup */
function fingerprint(level: string, module: string, message: string): string {
  const raw = `${level}:${module}:${message}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * Lightweight system logger — only for error/warning/critical events.
 * Throttles duplicate messages (same fingerprint) to 1 per 30s client-side.
 * Server-side dedup merges within 5 min windows via upsert_system_log RPC.
 */
export function useSystemLog() {
  const recentRef = useRef<Map<string, number>>(new Map());
  const THROTTLE_MS = 30_000;

  const log = useCallback(async (opts: LogOptions) => {
    const fp = fingerprint(opts.level, opts.module, opts.message);

    // Client-side throttle
    const now = Date.now();
    const last = recentRef.current.get(fp);
    if (last && now - last < THROTTLE_MS) return;
    recentRef.current.set(fp, now);

    // Trim metadata to ~2KB
    let meta = opts.metadata ?? {};
    if (JSON.stringify(meta).length > 2048) {
      meta = { truncated: true, keys: Object.keys(meta) };
    }

    try {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      await (supabase.rpc as any)("upsert_system_log", {
        p_level: opts.level,
        p_module: opts.module,
        p_message: opts.message,
        p_metadata: meta,
        p_user_id: userId,
        p_fingerprint: fp,
      });
    } catch {
      // Silent fail — logging should never crash the app
    }
  }, []);

  const logError = useCallback(
    (module: string, message: string, metadata?: Record<string, unknown>) =>
      log({ level: "error", module, message, metadata }),
    [log]
  );

  const logWarning = useCallback(
    (module: string, message: string, metadata?: Record<string, unknown>) =>
      log({ level: "warning", module, message, metadata }),
    [log]
  );

  const logCritical = useCallback(
    (module: string, message: string, metadata?: Record<string, unknown>) =>
      log({ level: "critical", module, message, metadata }),
    [log]
  );

  return { log, logError, logWarning, logCritical };
}
