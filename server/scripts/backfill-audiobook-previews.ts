import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { computePreviewTargetSeconds, generatePreviewClip } from "../src/lib/audioPreview.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function usage(): string {
  return `
Generate trimmed preview clips for existing is_preview audiobook tracks that
don't have one yet (preview_audio_url is null). Requires ffmpeg/ffprobe.

Dry-run by default. Add --execute to actually generate clips.

Examples:
  npm run backfill:audiobook-previews
  npm run backfill:audiobook-previews -- --execute
  npm run backfill:audiobook-previews -- --book-format-id <id> --execute

Options:
  --book-format-id <id>   Limit to a single book format.
  --limit <number>        Max tracks to process. Default: no limit.
  --execute               Actually generate and upload clips.
`.trim();
}

type Options = { bookFormatId?: string; limit?: number; execute: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { execute: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      case "--book-format-id":
        options.bookFormatId = argv[++i];
        break;
      case "--limit": {
        const limit = Number(argv[++i]);
        if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit must be a positive integer");
        options.limit = limit;
        break;
      }
      case "--execute":
        options.execute = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function backfill(options: Options) {
  const tracks = await prisma.audiobookTrack.findMany({
    where: {
      is_preview: true,
      status: "active",
      media_type: "audio",
      audio_url: { not: null },
      preview_audio_url: null,
      ...(options.bookFormatId ? { book_format_id: options.bookFormatId } : {}),
    },
    orderBy: { created_at: "asc" },
    take: options.limit,
    select: { id: true, title: true, book_format_id: true },
  });

  if (tracks.length === 0) {
    console.log("No tracks need a preview clip.");
    return;
  }

  console.log(`Found ${tracks.length} track(s) missing a preview clip:`);
  for (const t of tracks.slice(0, 20)) {
    console.log(`  ${t.id} | ${t.title} | format=${t.book_format_id}`);
  }
  if (tracks.length > 20) console.log(`  ...and ${tracks.length - 20} more`);

  if (!options.execute) {
    console.log("\nDry run only. Re-run with --execute to generate clips.");
    return;
  }

  const targetSecondsCache = new Map<string, number>();
  let generated = 0;
  let failed = 0;

  for (const track of tracks) {
    try {
      let targetSeconds = targetSecondsCache.get(track.book_format_id);
      if (targetSeconds === undefined) {
        targetSeconds = await computePreviewTargetSeconds(track.book_format_id);
        targetSecondsCache.set(track.book_format_id, targetSeconds);
      }
      const url = await generatePreviewClip(track.id, targetSeconds);
      if (url) {
        generated++;
        console.log(`  ✓ ${track.id} (${targetSeconds}s) → ${url}`);
      } else {
        failed++;
        console.warn(`  ✗ ${track.id} — generatePreviewClip returned null`);
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ ${track.id} —`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. generated=${generated} failed=${failed}`);
}

backfill(parseArgs(process.argv.slice(2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    console.error("");
    console.error(usage());
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
