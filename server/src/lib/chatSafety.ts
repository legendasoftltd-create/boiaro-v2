import { prisma } from "./prisma.js";
import { getRadioSetting, getRadioSettingBool, getRadioSettingNumber } from "./radioSettings.js";

const URL_RE = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/i;

export async function getBlockedWords(): Promise<string[]> {
  const raw = await getRadioSetting("radio_blocked_words");
  return raw.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
}

export function containsBlockedWord(text: string, blockedWords: string[]): boolean {
  const lower = text.toLowerCase();
  return blockedWords.some((w) => lower.includes(w));
}

export function containsLink(text: string): boolean {
  return URL_RE.test(text);
}

/**
 * Full chat/request-safety check — call before persisting any user-submitted
 * text in a live room. Returns a rejection reason string, or null if the
 * message is clean and may proceed.
 */
export async function checkMessageSafety(
  sessionId: string,
  userId: string,
  text: string
): Promise<string | null> {
  const [blockedWords, linksEnabled, dupWindowSeconds] = await Promise.all([
    getBlockedWords(),
    getRadioSettingBool("radio_chat_links_enabled"),
    getRadioSettingNumber("radio_duplicate_message_window_seconds"),
  ]);

  if (blockedWords.length && containsBlockedWord(text, blockedWords)) {
    return "Your message contains a blocked word";
  }
  if (!linksEnabled && containsLink(text)) {
    return "Links aren't allowed in chat";
  }
  if (dupWindowSeconds && dupWindowSeconds > 0) {
    const since = new Date(Date.now() - dupWindowSeconds * 1000);
    const recentDuplicate = await prisma.liveChatMessage.findFirst({
      where: { live_session_id: sessionId, user_id: userId, message: text, created_at: { gte: since } },
      select: { id: true },
    });
    if (recentDuplicate) return "You already sent that message";
  }
  return null;
}
