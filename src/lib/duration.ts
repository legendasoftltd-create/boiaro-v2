/**
 * Converts any duration string to total seconds.
 * Handles two formats stored in the DB:
 *   HH:MM:SS  →  "03:30:00" (PostgreSQL interval/text)
 *   XhXmXs    →  "3h 30m"  (admin-entered friendly format)
 */
export function durationToSeconds(dur: string | null | undefined): number {
  if (!dur) return 0;
  const s = dur.trim();

  // HH:MM:SS or H:MM:SS
  const colon = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (colon) {
    return parseInt(colon[1]) * 3600 + parseInt(colon[2]) * 60 + parseInt(colon[3]);
  }

  // Xh Xm Xs (any combination)
  const h = s.match(/(\d+)\s*h/i);
  const m = s.match(/(\d+)\s*m/i);
  const sec = s.match(/(\d+)\s*s/i);
  return (parseInt(h?.[1] || "0") * 3600) +
         (parseInt(m?.[1] || "0") * 60) +
         parseInt(sec?.[1] || "0");
}

/**
 * Converts any duration string to a human-readable label.
 *   "03:30:00" → "3h 30m"
 *   "1:05:00"  → "1h 5m"
 *   "0:45:00"  → "45m"
 *   "1h 30m"   → "1h 30m"  (already formatted)
 */
export function formatDuration(dur: string | null | undefined): string {
  if (!dur) return "N/A";
  const secs = durationToSeconds(dur);
  if (secs === 0) return dur; // Return as-is if unparseable
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}
