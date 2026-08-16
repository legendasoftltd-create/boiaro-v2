// Bangladesh is a fixed UTC+6 with no DST (abolished 2010), so plain
// arithmetic is correct here — no need for a timezone library like
// date-fns-tz. Used to align leaderboard/reporting date boundaries to Dhaka
// wall-clock instead of server-local/UTC time.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

type Period = "daily" | "weekly" | "monthly";

/** Shifts a UTC Date so its UTC-getters read as Dhaka wall-clock fields. */
function toDhakaShifted(date: Date): Date {
  return new Date(date.getTime() + DHAKA_OFFSET_MS);
}

/**
 * Exported for call sites that need individual Dhaka wall-clock fields
 * (day-of-week, hour, minute) rather than a period range — e.g. comparing
 * "is it time to send this show's reminder yet" against a HH:MM start time.
 * Read with the UTC getters (getUTCDay/getUTCHours/...), never the local
 * ones — the whole point is to not depend on the server process's own TZ.
 */
export function dhakaWallClock(ref: Date = new Date()): Date {
  return toDhakaShifted(ref);
}

/** Converts a "Dhaka wall-clock" Date (as produced via Date.UTC) back to a real UTC instant. */
function fromDhakaShifted(date: Date): Date {
  return new Date(date.getTime() - DHAKA_OFFSET_MS);
}

/**
 * Returns [start, end] as real UTC Date instants bounding the given period,
 * aligned to Asia/Dhaka wall-clock (start of day/week/month through the last
 * millisecond of that day/week/month). Week starts Sunday.
 */
export function dhakaPeriodBounds(period: Period, ref: Date = new Date()): { start: Date; end: Date } {
  const shifted = toDhakaShifted(ref);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();

  let start: Date;
  let end: Date;
  if (period === "daily") {
    start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
  } else if (period === "weekly") {
    const dow = shifted.getUTCDay(); // 0 = Sunday
    start = new Date(Date.UTC(y, m, d - dow, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, m, d - dow + 6, 23, 59, 59, 999));
  } else {
    start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)); // day 0 of next month = last day of this month
  }

  return { start: fromDhakaShifted(start), end: fromDhakaShifted(end) };
}

/** Same as the "monthly" case of dhakaPeriodBounds, but for an explicit admin-selected year/month (1-12). */
export function dhakaMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start: fromDhakaShifted(start), end: fromDhakaShifted(end) };
}

/** The current Dhaka calendar year/month (1-12), for defaulting admin selectors and the lock sweep. */
export function currentDhakaYearMonth(ref: Date = new Date()): { year: number; month: number } {
  const shifted = toDhakaShifted(ref);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}
