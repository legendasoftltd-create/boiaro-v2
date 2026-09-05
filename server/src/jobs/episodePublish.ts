import { prisma } from "../lib/prisma.js";
import { logRadioAction } from "../lib/radioAudit.js";
import { notifyFollowersOfShowPublished } from "../lib/radioNotify.js";

/**
 * Runs every minute (see jobs/index.ts). Releases On Air episodes whose
 * scheduled `publish_at` has passed — the "Schedule Publish" option on the
 * admin publish form.
 *
 * Only ever promotes a draft that already has its transcoded MP3: an episode
 * still encoding stays in "processing" and gets picked up by a later run, so
 * a scheduled release can never put a show with no playable audio in front of
 * a listener. An unpublish clears publish_at, so this can't resurrect one.
 */
export async function runEpisodeScheduledPublish(): Promise<{ published: number }> {
  const due = await prisma.onAirEpisode.findMany({
    where: {
      status: "draft",
      publish_at: { not: null, lte: new Date() },
      stream_audio_url: { not: null },
    },
    take: 50,
  });

  let published = 0;
  for (const episode of due) {
    await prisma.onAirEpisode.update({
      where: { id: episode.id },
      data: { status: "published", published_at: episode.published_at ?? new Date() },
    });
    await logRadioAction(episode.created_by ?? episode.rj_user_id, "onair_episode_auto_published", {
      episodeId: episode.id,
      scheduledFor: episode.publish_at?.toISOString(),
    });
    // Announce only a first release — a re-published episode isn't news.
    if (!episode.published_at) {
      notifyFollowersOfShowPublished(episode.rj_user_id, episode.title, episode.id).catch(() => null);
    }
    published++;
  }

  return { published };
}
