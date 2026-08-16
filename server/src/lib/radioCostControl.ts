import { prisma } from "./prisma.js";
import { getRadioSettingNumber } from "./radioSettings.js";

// Real enforcement on top of the storage/bandwidth limits already surfaced
// as capacity *alerts* in admin.serverMetrics — those limits used to be
// alert-only ("nothing auto-deletes/blocks to enforce it"). These are the
// two real, budget-bearing entry points a paid resource actually gets
// consumed at: a new recording (S3 storage) and a new broadcast (egress
// bandwidth) — both cost real money, so both get a hard stop once an admin
// has set a limit and it's been reached.

export async function getRecordingStorageUsedGb(): Promise<number> {
  const agg = await prisma.liveSession.aggregate({ _sum: { recording_file_size_bytes: true } });
  return (agg._sum.recording_file_size_bytes ?? 0) / 1024 ** 3;
}

export async function isRecordingStorageBudgetAvailable(): Promise<boolean> {
  const limitGb = await getRadioSettingNumber("radio_recording_storage_limit_gb");
  if (!limitGb) return true; // unset = unlimited, same convention as every other radio setting
  return (await getRecordingStorageUsedGb()) < limitGb;
}

export async function getEstimatedBandwidthGb30d(): Promise<number> {
  const bitrateKbps = (await getRadioSettingNumber("radio_estimated_bitrate_kbps")) ?? 128;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.listenerSession.findMany({
    where: { joined_at: { gte: since } },
    select: { joined_at: true, left_at: true },
  });
  const now = Date.now();
  const seconds = rows.reduce((sum, r) => sum + Math.max(0, ((r.left_at?.getTime() ?? now) - r.joined_at.getTime()) / 1000), 0);
  return (seconds * bitrateKbps * 1000) / 8 / 1024 ** 3;
}

export async function isBandwidthBudgetAvailable(): Promise<boolean> {
  const limitGb = await getRadioSettingNumber("radio_monthly_bandwidth_limit_gb");
  if (!limitGb) return true;
  return (await getEstimatedBandwidthGb30d()) < limitGb;
}
