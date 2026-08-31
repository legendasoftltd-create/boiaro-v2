/**
 * The message an RJ sees when they try to start a second broadcast while one
 * of theirs is still running.
 *
 * Naming the show matters more than it looks. An RJ whose stream had gone
 * quiet would start another, and another — thirteen sessions in two hours on
 * 2026-08-31, at one point live on two stations at once with listeners split
 * between them. The per-station unique index cannot catch that, because the
 * sessions are on different stations. Telling them *which* show is still
 * holding the slot is what makes "end it first" an instruction they can
 * actually act on rather than a wall.
 */
export function runningShowMessage(show: { show_title: string | null; started_at: Date }): string {
  const title = show.show_title?.trim();
  const started = show.started_at.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
  });
  const which = title ? `"${title}" (${started} থেকে)` : `${started}-এ শুরু হওয়া শো-টি`;
  return `আপনার ${which} এখনো সম্প্রচারে আছে। নতুন শো শুরু করার আগে ওই শো-টি শেষ করুন।`;
}
