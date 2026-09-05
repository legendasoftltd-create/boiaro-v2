import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";
import { createPresignedGetUrl, isS3Url, s3Configured } from "../lib/s3.js";
import { ACTIVE_SUBSCRIPTION_WHERE } from "./bookAccess.service.js";

export const EPISODE_STATUSES = ["processing", "draft", "pending_review", "published", "unpublished"] as const;
export const EPISODE_VISIBILITIES = ["public", "premium", "unlisted"] as const;
export const RECORDING_TYPES = ["mixed", "voice_only"] as const;

export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];
export type EpisodeVisibility = (typeof EPISODE_VISIBILITIES)[number];

/**
 * Requirement 3 — "Voice Only মূলত internal/editing/mastering purpose-এর জন্য
 * থাকবে এবং defaultভাবে public publish করা যাবে না." A voice-only master is a
 * mixing artefact (host mic with no music or jingles), so publishing one to the
 * app is refused unless an admin explicitly overrides it per-episode.
 */
export const DEFAULT_PUBLISH_RECORDING_TYPE = "mixed";

/** Thrown when a progress/play call names an episode that doesn't exist. */
export class EpisodeNotFoundError extends Error {
  constructor() {
    super("Show not found");
    this.name = "EpisodeNotFoundError";
  }
}

/**
 * The only statuses the app is ever allowed to see. `unpublished` is
 * deliberately absent: pulling a show back has to actually remove it from
 * Latest Shows, not just grey it out.
 */
const LISTABLE_STATUS = "published";

export interface EpisodeViewerContext {
  userId: string | null;
  /** Resolved lazily — a public-only feed never has to hit the subscriptions table. */
  hasActiveSubscription?: boolean;
}

export async function viewerHasActiveSubscription(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const sub = await prisma.userSubscription.findFirst({
    where: ACTIVE_SUBSCRIPTION_WHERE(userId),
    select: { id: true },
  });
  return !!sub;
}

/**
 * Which visibilities this viewer may be shown in a *list*.
 *
 * `unlisted` is never listed for anyone — that's what makes it unlisted. It
 * stays reachable by direct id (a shared link), which `canViewEpisode` below
 * allows.
 */
export function listableVisibilities(hasActiveSubscription: boolean): EpisodeVisibility[] {
  return hasActiveSubscription ? ["public", "premium"] : ["public"];
}

export function canViewEpisode(
  episode: { status: string; visibility: string },
  hasActiveSubscription: boolean
): boolean {
  if (episode.status !== LISTABLE_STATUS) return false;
  if (episode.visibility === "premium") return hasActiveSubscription;
  return true;
}

/**
 * Prisma `where` for everything the app may list, newest published first.
 * Scheduled episodes are excluded by status alone — jobs/episodePublish.ts
 * only flips them to `published` once publish_at has passed — but the
 * published_at guard is kept as a belt-and-braces check so a row published
 * with a future timestamp by hand can't jump the queue either.
 */
export function publicEpisodeWhere(opts: {
  hasActiveSubscription: boolean;
  showScheduleId?: string | null;
  rjUserId?: string | null;
  stationId?: string | null;
}) {
  return {
    status: LISTABLE_STATUS,
    visibility: { in: listableVisibilities(opts.hasActiveSubscription) },
    stream_audio_url: { not: null },
    published_at: { not: null, lte: new Date() },
    ...(opts.showScheduleId ? { show_schedule_id: opts.showScheduleId } : {}),
    ...(opts.rjUserId ? { rj_user_id: opts.rjUserId } : {}),
    ...(opts.stationId ? { station_id: opts.stationId } : {}),
  } as const;
}

export interface PublicEpisode {
  id: string;
  title: string;
  episode_title: string | null;
  description: string | null;
  cover_image_url: string | null;
  /** Always the transcoded MP3 — the WAV master is never exposed to a client. */
  audio_url: string | null;
  mime_type: string | null;
  duration_seconds: number | null;
  recorded_at: string;
  published_at: string | null;
  visibility: string;
  play_count: number;
  show_schedule_id: string | null;
  rj_user_id: string;
  rj_stage_name: string | null;
  rj_avatar_url: string | null;
  station: { id: string; name: string; artwork_url: string | null } | null;
  resume_position_seconds?: number;
  completed?: boolean;
}

/**
 * How long a returned audio URL stays valid.
 *
 * Episode MP3s live in a private S3 prefix and are handed out presigned — the
 * same treatment paid audiobook chapters get — so a `premium` show can't be
 * hot-linked past the subscription check by anyone who once had the URL. Six
 * hours rather than the chapters' one, because a radio show is a single file
 * an hour or two long: the player re-requests byte ranges while seeking, and
 * a URL that expired mid-show would break playback halfway through.
 */
const STREAM_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Presigned when the file is on S3.
 *
 * A transcode that ran while S3 was unreachable falls back to local disk, and
 * /uploads is served unauthenticated — so for a `premium` show that URL would
 * hand the audio to anyone, defeating the gate. Those fail closed (null, which
 * the callers surface as `locked`) until storageSync pushes the file to S3 and
 * patches the URL. Public and unlisted shows are served from disk as-is, which
 * is what every other locally-stored media file in the app already does.
 */
async function toPlayableUrl(rawUrl: string | null, visibility: string): Promise<string | null> {
  if (!rawUrl) return null;
  const resolved = resolveFileUrl(rawUrl);
  if (!resolved) return null;
  if (s3Configured && isS3Url(resolved)) {
    try { return await createPresignedGetUrl(resolved, STREAM_URL_TTL_SECONDS); } catch { return null; }
  }
  return visibility === "premium" ? null : resolved;
}

type EpisodeRow = Awaited<ReturnType<typeof prisma.onAirEpisode.findMany>>[number];

/**
 * Maps DB rows to the shape both the web (tRPC) and app (REST) clients get.
 *
 * Notably it never emits `master_audio_url`: requirement 1 keeps the WAV as an
 * admin-only backup, and leaking it would also hand every listener a
 * multi-hundred-megabyte download.
 */
export async function toPublicEpisodes(
  rows: EpisodeRow[],
  opts: { userId?: string | null; includeProgress?: boolean } = {}
): Promise<PublicEpisode[]> {
  if (!rows.length) return [];

  const rjIds = [...new Set(rows.map((r) => r.rj_user_id))];
  const stationIds = [...new Set(rows.map((r) => r.station_id).filter(Boolean) as string[])];
  const scheduleIds = [...new Set(rows.map((r) => r.show_schedule_id).filter(Boolean) as string[])];

  const [profiles, stations, schedules, progress] = await Promise.all([
    rjIds.length
      ? prisma.rjProfile.findMany({ where: { user_id: { in: rjIds } }, select: { user_id: true, stage_name: true, avatar_url: true } })
      : Promise.resolve([]),
    stationIds.length
      ? prisma.radioStation.findMany({ where: { id: { in: stationIds } }, select: { id: true, name: true, artwork_url: true } })
      : Promise.resolve([]),
    scheduleIds.length
      ? prisma.showSchedule.findMany({ where: { id: { in: scheduleIds } }, select: { id: true, show_title: true, cover_image_url: true } })
      : Promise.resolve([]),
    opts.includeProgress && opts.userId
      ? prisma.onAirEpisodeProgress.findMany({
          where: { user_id: opts.userId, episode_id: { in: rows.map((r) => r.id) } },
          select: { episode_id: true, position_seconds: true, completed: true },
        })
      : Promise.resolve([]),
  ]);

  const pMap = new Map(profiles.map((p) => [p.user_id, p]));
  const sMap = new Map(stations.map((s) => [s.id, s]));
  const schedMap = new Map(schedules.map((s) => [s.id, s]));
  const progMap = new Map(progress.map((p) => [p.episode_id, p]));

  return Promise.all(rows.map(async (r) => {
    const station = r.station_id ? sMap.get(r.station_id) ?? null : null;
    const schedule = r.show_schedule_id ? schedMap.get(r.show_schedule_id) ?? null : null;
    const prog = progMap.get(r.id);
    return {
      id: r.id,
      title: r.title,
      episode_title: r.episode_title,
      description: r.description,
      // Cover fallback chain mirrors the publish form's default: the episode's
      // own cover, else the programme's, else the station artwork.
      cover_image_url: resolveFileUrl(r.cover_image_url ?? schedule?.cover_image_url ?? station?.artwork_url ?? null),
      audio_url: await toPlayableUrl(r.stream_audio_url, r.visibility),
      mime_type: r.stream_mime_type,
      duration_seconds: r.duration_seconds,
      recorded_at: r.recorded_at.toISOString(),
      published_at: r.published_at ? r.published_at.toISOString() : null,
      visibility: r.visibility,
      play_count: r.play_count,
      show_schedule_id: r.show_schedule_id,
      rj_user_id: r.rj_user_id,
      rj_stage_name: pMap.get(r.rj_user_id)?.stage_name ?? null,
      rj_avatar_url: resolveFileUrl(pMap.get(r.rj_user_id)?.avatar_url ?? null),
      station: station ? { id: station.id, name: station.name, artwork_url: resolveFileUrl(station.artwork_url) } : null,
      ...(opts.includeProgress
        ? { resume_position_seconds: prog?.position_seconds ?? 0, completed: prog?.completed ?? false }
        : {}),
    };
  }));
}

/** The distinct programmes and RJs that actually have published episodes — the archive page's filter options. */
export async function listArchiveFilters(hasActiveSubscription: boolean) {
  const rows = await prisma.onAirEpisode.findMany({
    where: publicEpisodeWhere({ hasActiveSubscription }),
    select: { show_schedule_id: true, rj_user_id: true, title: true },
  });

  const scheduleIds = [...new Set(rows.map((r) => r.show_schedule_id).filter(Boolean) as string[])];
  const rjIds = [...new Set(rows.map((r) => r.rj_user_id))];

  const [schedules, profiles] = await Promise.all([
    scheduleIds.length
      ? prisma.showSchedule.findMany({ where: { id: { in: scheduleIds } }, select: { id: true, show_title: true } })
      : Promise.resolve([]),
    rjIds.length
      ? prisma.rjProfile.findMany({ where: { user_id: { in: rjIds } }, select: { user_id: true, stage_name: true } })
      : Promise.resolve([]),
  ]);

  return {
    shows: schedules.map((s) => ({ id: s.id, name: s.show_title })).sort((a, b) => a.name.localeCompare(b.name)),
    rjs: profiles.map((p) => ({ id: p.user_id, name: p.stage_name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Records a play and returns the listener's saved resume position.
 * Anonymous listeners still bump the counter; only a logged-in one gets a
 * resume position, since there's nowhere to store one otherwise.
 */
export async function recordEpisodePlay(episodeId: string, userId: string | null) {
  await prisma.onAirEpisode.update({ where: { id: episodeId }, data: { play_count: { increment: 1 } } });
  if (!userId) return { resume_position_seconds: 0, completed: false };

  const row = await prisma.onAirEpisodeProgress.upsert({
    where: { user_id_episode_id: { user_id: userId, episode_id: episodeId } },
    create: { user_id: userId, episode_id: episodeId },
    update: { total_plays: { increment: 1 }, last_played_at: new Date() },
  });
  return { resume_position_seconds: row.position_seconds, completed: row.completed };
}

/** 95% counts as finished — the last minutes of a radio show are usually outro/jingle. */
const COMPLETION_THRESHOLD = 0.95;

export async function saveEpisodeProgress(
  episodeId: string,
  userId: string,
  positionSeconds: number,
  durationSeconds?: number | null
) {
  // A bogus id would otherwise surface as an unhandled foreign-key violation
  // (a 500) rather than the 404 it actually is.
  const episode = await prisma.onAirEpisode.findUnique({
    where: { id: episodeId },
    select: { duration_seconds: true },
  });
  if (!episode) throw new EpisodeNotFoundError();

  const duration = durationSeconds ?? episode.duration_seconds ?? null;
  const completed = !!duration && duration > 0 && positionSeconds >= duration * COMPLETION_THRESHOLD;

  return prisma.onAirEpisodeProgress.upsert({
    where: { user_id_episode_id: { user_id: userId, episode_id: episodeId } },
    create: { user_id: userId, episode_id: episodeId, position_seconds: positionSeconds, duration_seconds: duration, completed },
    update: { position_seconds: positionSeconds, duration_seconds: duration, completed, last_played_at: new Date() },
  });
}
