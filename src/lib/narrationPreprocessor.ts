/**
 * Audiobook-style narration preprocessor for Bangla TTS.
 *
 * Converts raw Bangla text into an array of NarrationSegment objects
 * that carry emotion/pacing metadata consumed by useBanglaTTS.
 *
 * Bangla-first: optimised for দাঁড়ি (।), Bangla comma, dialogue dashes,
 * and common Bangla punctuation patterns.
 */

export type EmotionTag =
  | "neutral"
  | "soft"
  | "deep"
  | "suspense"
  | "fear"
  | "whisper"
  | "joy"
  | "anger"
  | "sad";

export interface NarrationSegment {
  text: string;
  emotion: EmotionTag;
  /** Extra silence (ms) to insert AFTER this segment is spoken */
  postPauseMs: number;
}

/* ── Language detection ────────────────────────────────────────── */

const BANGLA_CHAR_RE = /[\u0980-\u09FF]/;

/** Returns true when ≥40 % of alphabetic characters are Bangla */
export function isBanglaText(text: string): boolean {
  let bangla = 0;
  let latin = 0;
  for (const ch of text) {
    if (BANGLA_CHAR_RE.test(ch)) bangla++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }
  const total = bangla + latin;
  if (total === 0) return false;
  return bangla / total >= 0.4;
}

/* ── Bangla text normalisation (TTS only — never mutate UI text) ─ */

export function normaliseBanglaForTTS(raw: string): string {
  let t = raw;

  // Collapse zero-width chars
  t = t.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

  // Normalise line breaks
  t = t.replace(/\r\n?/g, "\n");

  // Collapse 3+ newlines to 2 (paragraph break)
  t = t.replace(/\n{3,}/g, "\n\n");

  // Collapse runs of spaces (but keep newlines)
  t = t.replace(/[^\S\n]+/g, " ");

  // Normalise repeated punctuation: ।।। → ।   ... already handled by emotion
  t = t.replace(/।{2,}/g, "।");
  t = t.replace(/!{2,}/g, "!");
  t = t.replace(/\?{2,}/g, "?");

  // Add space after দাঁড়ি / comma if missing (common OCR issue)
  t = t.replace(/([।,])([^\s\n"'"\u201D)\]])/g, "$1 $2");

  // Normalise Bangla quote marks to standard ones
  t = t.replace(/['']/g, "'");
  t = t.replace(/[""]/g, '"');

  return t.trim();
}

/* ── Emotion keyword detectors (Bangla) ───────────────────────── */

const FEAR_KEYWORDS =
  /ভয়|আতঙ্ক|চিৎকার|অন্ধকার|রক্ত|মৃত্যু|ভূত|প্রেত|কাঁপ|শিউরে|হাড়/;
const SUSPENSE_KEYWORDS =
  /হঠাৎ|আচমকা|চমকে|থমকে|কী হলো|কে যেন|অদ্ভুত|রহস্য|নিশ্চুপ|নিস্তব্ধ|গোপন/;
const SOFT_KEYWORDS =
  /ভালোবাসা|আদর|মায়া|স্নেহ|কোমল|শান্ত|মৃদু|আলতো|ঘুম|স্বপ্ন/;
const DEEP_KEYWORDS =
  /জীবন|মরণ|সত্য|ন্যায়|বিচার|ইতিহাস|দর্শন|চিন্তা|ধ্বংস|যুদ্ধ|সংগ্রাম|দায়িত্ব/;
const WHISPER_KEYWORDS =
  /ফিসফিস|চুপ|গোপনে|কানে কানে|আস্তে|নিঃশব্দে|লুকিয়ে/;
const JOY_KEYWORDS =
  /আনন্দ|খুশি|হাসি|উল্লাস|মজা|উৎসব|আহ্লাদ|প্রফুল্ল|তৃপ্তি|হুররে/;
const ANGER_KEYWORDS =
  /রাগ|ক্রোধ|ক্ষোভ|ঘৃণা|প্রতিশোধ|অভিশাপ|ধিক্কার|জ্বলে|গর্জন|চণ্ড/;
const SAD_KEYWORDS =
  /কান্না|দুঃখ|কষ্ট|বেদনা|চোখের জল|অশ্রু|শোক|বিষাদ|হতাশা|একাকী|নিঃসঙ্গ/;

function detectEmotion(line: string): EmotionTag {
  if (WHISPER_KEYWORDS.test(line)) return "whisper";
  if (FEAR_KEYWORDS.test(line)) return "fear";
  if (ANGER_KEYWORDS.test(line)) return "anger";
  if (SUSPENSE_KEYWORDS.test(line)) return "suspense";
  if (SAD_KEYWORDS.test(line)) return "sad";
  if (JOY_KEYWORDS.test(line)) return "joy";
  if (SOFT_KEYWORDS.test(line)) return "soft";
  if (DEEP_KEYWORDS.test(line)) return "deep";
  return "neutral";
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** True if line looks like dialogue (starts with quotes or dashes) */
function isDialogue(line: string): boolean {
  return /^["'"\u201C\u201D—–\-]/.test(line.trim());
}

/**
 * Split a sentence at natural break-points so each chunk is comfortable
 * for TTS (≤ maxWords). Bangla-aware: splits on commas, semicolons,
 * দাঁড়ি, conjunctions, and em-dashes.
 */
function splitLong(sentence: string, maxWords = 10): string[] {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return [sentence];

  const chunks: string[] = [];
  let buf: string[] = [];

  const BANGLA_CONJUNCTIONS =
    /^(এবং|কিন্তু|তবে|অথবা|যদি|তাহলে|কারণ|তাই|অথচ|যখন|তখন|আর|কিংবা|সুতরাং|ফলে|নাহলে|যেন)$/;

  for (const w of words) {
    buf.push(w);
    const endsWithBreak = /[,;।:—–\-]$/.test(w);
    const isConj = BANGLA_CONJUNCTIONS.test(w);
    if (buf.length >= maxWords || (buf.length >= 4 && (endsWithBreak || isConj))) {
      chunks.push(buf.join(" "));
      buf = [];
    }
  }
  if (buf.length) chunks.push(buf.join(" "));
  return chunks;
}

/* ── Main preprocessor ────────────────────────────────────────── */

export function preprocessForNarration(rawText: string): NarrationSegment[] {
  if (!rawText?.trim()) return [];

  // 1. Normalise for TTS
  const text = normaliseBanglaForTTS(rawText);

  // 2. Split into sentences on Bangla দাঁড়ি (।) and English punctuation
  //    Also treat paragraph breaks as sentence boundaries
  const rawSentences = text
    .split(/(?<=[।.!?…])\s*|\n{2,}/)
    .filter((s) => s.trim().length > 0);

  const segments: NarrationSegment[] = [];

  for (const sentence of rawSentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // 3. Break long sentences into short chunks
    const chunks = splitLong(trimmed, 10);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLast = i === chunks.length - 1;
      const emotion = detectEmotion(chunk);
      const dialogue = isDialogue(chunk);

      // 4. Calculate post-pause — Bangla-optimised pauses
      let postPause = 150; // default micro-pause between chunks

      if (isLast) {
        if (/[…]$/.test(chunk)) {
          postPause = 700; // dramatic ellipsis pause
        } else if (/।$/.test(chunk)) {
          postPause = 450; // দাঁড়ি — natural Bangla sentence-end pause
        } else if (/[.!?]$/.test(chunk)) {
          postPause = 350;
        }
      }

      // Comma / semicolon mid-sentence pause
      if (!isLast && /[,;]$/.test(chunk)) {
        postPause = Math.max(postPause, 250);
      }

      // Pause around quotes — slight breath before/after dialogue
      if (/^["'\u201C]/.test(chunk) && segments.length > 0) {
        segments[segments.length - 1].postPauseMs = Math.max(
          segments[segments.length - 1].postPauseMs,
          300,
        );
      }
      if (/["'\u201D]$/.test(chunk)) {
        postPause = Math.max(postPause, 280);
      }

      // Emotion-based extra pauses (moderate intensity)
      if (emotion === "suspense" || emotion === "fear") {
        postPause = Math.max(postPause, 600);
      } else if (emotion === "anger") {
        postPause = Math.max(postPause, 450);
      } else if (emotion === "sad") {
        postPause = Math.max(postPause, 550);
      } else if (emotion === "soft" || emotion === "whisper") {
        postPause = Math.max(postPause, 500);
      } else if (emotion === "joy") {
        postPause = Math.max(postPause, 300);
      } else if (emotion === "deep") {
        postPause = Math.max(postPause, 400);
      }

      // Dialogue gets a small lead-in pause
      if (dialogue && segments.length > 0) {
        segments[segments.length - 1].postPauseMs = Math.max(
          segments[segments.length - 1].postPauseMs,
          450,
        );
      }

      segments.push({
        text: chunk,
        emotion,
        postPauseMs: postPause,
      });
    }
  }

  return segments;
}

/* ── Voice parameter overrides per emotion ────────────────────── */

export interface VoiceParams {
  rate: number;
  pitch: number;
  volume: number;
}

export function getVoiceParamsForEmotion(emotion: EmotionTag): VoiceParams {
  switch (emotion) {
    case "soft":
      return { rate: 0.78, pitch: 1.15, volume: 0.80 };
    case "deep":
      return { rate: 0.72, pitch: 0.85, volume: 1.0 };
    case "suspense":
      return { rate: 0.68, pitch: 0.90, volume: 0.85 };
    case "fear":
      return { rate: 0.92, pitch: 1.12, volume: 0.95 };
    case "whisper":
      return { rate: 0.65, pitch: 1.08, volume: 0.50 };
    case "joy":
      return { rate: 1.05, pitch: 1.20, volume: 1.0 };
    case "anger":
      return { rate: 1.0, pitch: 0.82, volume: 1.0 };
    case "sad":
      return { rate: 0.70, pitch: 0.95, volume: 0.75 };
    case "neutral":
    default:
      return { rate: 0.88, pitch: 1.02, volume: 1.0 };
  }
}

/**
 * Adaptive rate multiplier: slightly slow down for long chunks
 * to improve comprehension. Returns 1.0 for normal, lower for long text.
 */
export function getAdaptiveRateMultiplier(text: string): number {
  const words = text.split(/\s+/).length;
  if (words > 20) return 0.92;
  if (words > 14) return 0.96;
  return 1.0;
}

/** Short Bangla sample text for voice preview */
export const BANGLA_PREVIEW_TEXT =
  "একটি সুন্দর সকালে, পাখিরা গাছের ডালে বসে গান গাইছিল। বাতাসে ফুলের সুবাস ভেসে আসছিল। জীবন সত্যিই অপূর্ব।";
