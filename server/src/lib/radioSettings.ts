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
  // Whether listeners are shown how many people are tuned in. Off means the
  // count is never sent to a listener at all — not merely hidden in the UI —
  // so a quiet show cannot be read off the network tab either. Admin's own
  // "Live Now" monitoring is unaffected.
  radio_listener_count_visible: "true",
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

  // §14 Mixer ducking defaults — seed a new broadcast's ducking sliders;
  // each RJ can still adjust their own per-broadcast (see
  // useStudioMixer.ts), these are just the platform-wide starting point.
  radio_mixer_duck_level: "0.25", // 0-1, how far music/jingles duck while the host speaks
  radio_mixer_duck_attack_ms: "200", // ramp-down time when the host starts speaking
  radio_mixer_duck_release_ms: "1000", // ramp-back-up time after the host stops speaking

  // §14 Mixer platform controls.
  radio_mixer_enabled: "true", // hard off switch for the whole mixer/voice-DSP feature
  radio_mixer_rj_upload_enabled: "true", // RJs can add their own tracks (platform-curated uploads are always allowed for admins)
  radio_mixer_require_approval: "false", // RJ self-uploads start "pending" instead of going live immediately
  radio_mixer_max_file_size_mb: "20",
  radio_mixer_allowed_formats: "mp3,wav,m4a,ogg,aac", // comma-separated file extensions
  radio_mixer_max_playlist_length: "50", // per-broadcast queue cap

  // Social Live Broadcasting (Facebook / YouTube). The encoder is a pure
  // consumer of the Icecast feed — nothing here can affect the App/Website
  // broadcast, and social_live_enabled is the hard off switch that makes the
  // whole feature inert without needing a deploy.
  social_live_enabled: "false", // master kill switch — off until a phase is signed off
  social_auto_start_enabled: "false", // scheduled auto-start/auto-stop (built in a later phase)
  social_max_concurrent_encoders: "1", // refuse to start beyond this many encoder processes
  social_video_bitrate_kbps: "4500",
  social_audio_bitrate_kbps: "128",
  social_framerate: "30",
  social_keyframe_seconds: "2", // platforms want a keyframe every 2s
  social_x264_preset: "veryfast", // measured: ~1 core for a static scene at 1080p30
  // Hard cap on encoder CPU. A realtime Icecast source paces the encode on
  // its own, but a source that is NOT realtime (a misconfigured stream_url
  // pointing at a plain file, say) makes ffmpeg encode as fast as it can —
  // observed at ~690% CPU in local testing. Capping threads bounds that to a
  // fraction of the box instead of all of it. 2 is ample: a static 1080p30
  // scene was measured at about one core.
  social_encoder_threads: "2",
  // How many PNG frames per second the encoder pushes into ffmpeg. Low on
  // purpose — the scene is a still image, and ffmpeg duplicates frames up to
  // the output framerate. Raising this only matters if a scene ever animates.
  social_scene_fps: "2",
  // §14: a few seconds of lost audio must not stop the broadcast. ffmpeg
  // retries the Icecast source itself for this long before giving up.
  social_source_reconnect_max_seconds: "120",
  // How often the supervisor re-checks that the audio source is answering.
  social_source_check_seconds: "15",
  // Consecutive failed source checks before the broadcast is called degraded
  // and the admin is alerted. At the default check interval this is ~1 minute
  // of real silence, not one unlucky probe.
  social_source_failure_threshold: "4",
  // Live poster shown in the social video scene. Empty means "decide
  // automatically": the current show's cover, then the station artwork, then
  // the plain branded card. Setting it here overrides all of that, which is
  // what the admin's "Live Poster" control writes to.
  social_poster_url: "",
  social_resolution: "1920x1080",

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
