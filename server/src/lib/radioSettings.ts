import { prisma } from "./prisma.js";

// platform_settings keys for Live Radio feature toggles / cost controls.
// Every one of these gates real server-side behavior (socket + REST + tRPC),
// not just UI visibility — flipping a toggle off actually blocks the action.
export const RADIO_SETTINGS_DEFAULTS = {
  radio_chat_enabled: "true",
  radio_reactions_enabled: "true",
  radio_requests_enabled: "true",
  radio_catchup_enabled: "true",
  radio_recording_enabled: "true",
  radio_callin_enabled: "false",
  radio_callin_max_concurrent: "1",
  radio_guest_listening_enabled: "true",
  radio_max_concurrent_listeners: "", // empty = unlimited
  radio_reconnect_grace_seconds: "120",
  radio_reconnect_timeout_seconds: "600", // auto-end after this much total silence
  radio_transcoding_enabled: "false", // placeholder — no transcoding pipeline implemented
  radio_terms_version: "1",

  // Automatic recording lifecycle / storage cost control.
  radio_recording_draft_retention_days: "7", // unpublished/draft auto-delete after this many days
  radio_recording_published_retention_days: "", // empty = keep forever
  radio_recording_storage_limit_gb: "", // empty = unlimited — alert-only, nothing auto-deletes to enforce it
  radio_monthly_bandwidth_limit_gb: "", // empty = unlimited
  radio_estimated_bitrate_kbps: "128", // used only to compute the bandwidth/cost estimate below
  radio_estimated_cost_per_gb: "", // admin-entered currency/GB — empty disables the cost estimate

  // Chat safety.
  radio_slow_mode_seconds: "2", // minimum gap between messages from the same user
  radio_blocked_words: "", // comma-separated, case-insensitive substrings
  radio_chat_links_enabled: "true", // false = strip any message containing a URL
  radio_duplicate_message_window_seconds: "30", // reject an identical repeat from the same user within this window
} as const;

export type RadioSettingKey = keyof typeof RADIO_SETTINGS_DEFAULTS;

export async function getRadioSettings(): Promise<Record<RadioSettingKey, string>> {
  const keys = Object.keys(RADIO_SETTINGS_DEFAULTS) as RadioSettingKey[];
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
  const map = { ...RADIO_SETTINGS_DEFAULTS } as Record<RadioSettingKey, string>;
  rows.forEach((r) => {
    if (r.key in map) map[r.key as RadioSettingKey] = r.value;
  });
  return map;
}

export async function getRadioSetting(key: RadioSettingKey): Promise<string> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? RADIO_SETTINGS_DEFAULTS[key];
}

export async function getRadioSettingBool(key: RadioSettingKey): Promise<boolean> {
  return (await getRadioSetting(key)) === "true";
}

export async function getRadioSettingNumber(key: RadioSettingKey): Promise<number | null> {
  const v = await getRadioSetting(key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
