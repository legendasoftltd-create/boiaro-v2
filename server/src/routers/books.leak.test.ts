import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

/**
 * Guards the invariant behind BUG-021: no public book payload may carry a raw
 * media location. resolveBookUrls() strips file_url / audio_url and replaces
 * them with has_file / has_audio booleans, so any procedure that returns a full
 * BookFormat or AudiobookTrack row has to go through it.
 *
 * books.bySlug was added without it and leaked the ebook's file_url to
 * unauthenticated callers — static review missed it because it only looked at
 * the paths that already called resolveBookUrls. This test looks the other way
 * round: it finds the paths that don't.
 */
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "books.ts"),
  "utf8"
);

/** Procedures whose `formats` projection is a narrow select of safe scalar
 *  fields, so there is no media location to strip. Verified by reading each. */
const NARROW_SELECT_OK = new Set([
  "userBookmarks", "recentlyViewed", "searchApprovedBooks",
  "recommendations", "homepageCategorySections",
]);

function procedures() {
  const parts = src.split(/\n {2}(\w+): (publicProcedure|protectedProcedure|adminProcedure)/);
  const out: { name: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 3) out.push({ name: parts[i], body: parts[i + 2] });
  return out;
}

describe("books router — media locations never ship with the catalogue", () => {
  it("every procedure returning a full format/track row calls resolveBookUrls", () => {
    const offenders: string[] = [];
    for (const { name, body } of procedures()) {
      if (NARROW_SELECT_OK.has(name)) continue;
      // A projection (not a `some:` where-filter) that includes rather than
      // narrowly selects means full rows come back.
      const projections = [...body.matchAll(/formats:\s*\{/g)].filter((m) => {
        const seg = body.slice(m.index!, m.index! + 80);
        return !seg.includes("some:");
      });
      const returnsFullRows =
        projections.some((m) => {
          const seg = body.slice(m.index!, m.index! + 300);
          return seg.includes("include:") || !seg.includes("select:");
        }) || /audiobook_tracks:\s*\{(?![^}]*select:)/.test(body);
      if (returnsFullRows && !body.includes("resolveBookUrls")) offenders.push(name);
    }
    expect(offenders, `these return full format/track rows without stripping: ${offenders.join(", ")}`).toEqual([]);
  });

  it("resolveBookUrls is actually imported here", () => {
    expect(src).toMatch(/import\s*\{[^}]*resolveBookUrls/);
  });
});
