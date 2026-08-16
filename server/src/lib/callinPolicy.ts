import { prisma } from "./prisma.js";
import { getRadioSettingBool } from "./radioSettings.js";

/**
 * Whether call-in can be offered for a broadcast — three independent
 * admin-level gates, all of which must say yes: the platform-wide switch,
 * the station's own switch (a station with a history of abuse can be
 * blocked without touching the whole platform), and the RJ's own switch
 * (an individual RJ can be blocked without touching their station). The
 * RJ's own per-session on/off choice (LiveSession.callin_enabled) is a
 * separate, later gate checked at call-request time — this function only
 * covers whether the option can be turned on at all when going live.
 */
export async function isCallinAllowedForBroadcast(stationId: string | null | undefined, rjUserId: string): Promise<boolean> {
  const [platformEnabled, station, profile] = await Promise.all([
    getRadioSettingBool("radio_callin_enabled"),
    stationId ? prisma.radioStation.findUnique({ where: { id: stationId }, select: { callin_enabled: true } }) : null,
    prisma.rjProfile.findUnique({ where: { user_id: rjUserId }, select: { callin_enabled: true } }),
  ]);
  if (!platformEnabled) return false;
  if (station && !station.callin_enabled) return false;
  if (profile && !profile.callin_enabled) return false;
  return true;
}
