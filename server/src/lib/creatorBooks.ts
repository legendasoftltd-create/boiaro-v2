import { prisma } from "./prisma.js";

export type CreatorRole = "writer" | "narrator" | "publisher" | "translator";

/**
 * A creator's books come from three independent sources that don't always overlap:
 * books they submitted directly, BookContributor role assignments (admin-assigned),
 * and legacy Author/Narrator/Translator/Publisher catalog entities linked to their
 * user_id. Any endpoint that counts or lists "a creator's books" must union all
 * three or its numbers will silently disagree with the others.
 */
export async function getCreatorBookIds(userId: string, role: CreatorRole): Promise<Set<string>> {
  const formatByRole: Record<CreatorRole, string> = {
    writer: "ebook",
    narrator: "audiobook",
    publisher: "hardcopy",
    translator: "ebook",
  };
  const relevantFormat = formatByRole[role];

  const ids = new Set<string>();

  // Path 1: books submitted by this user with the relevant format
  const ownBooks = await prisma.book.findMany({
    where: {
      submitted_by: userId,
      formats: { some: { format: relevantFormat as any } },
    },
    select: { id: true },
  });
  ownBooks.forEach((b) => ids.add(b.id));

  // Path 2: books via BookContributor (admin-assigned role links)
  const contribs = await prisma.bookContributor.findMany({
    where: { user_id: userId, role },
    select: { book_id: true },
  });
  contribs.forEach((c) => ids.add(c.book_id));

  // Path 3: books via Narrator/Author/Translator/Publisher entity linked to this user_id
  if (role === "narrator") {
    const narrator = await prisma.narrator.findFirst({ where: { user_id: userId } });
    if (narrator) {
      const fmts = await prisma.bookFormat.findMany({
        where: {
          format: "audiobook" as any,
          OR: [{ narrator_id: narrator.id }, { narrator_ids: { has: narrator.id } }],
        },
        select: { book_id: true },
      });
      fmts.forEach((f) => ids.add(f.book_id));
    }
  } else if (role === "writer") {
    const author = await prisma.author.findFirst({ where: { user_id: userId } });
    if (author) {
      const bks = await prisma.book.findMany({ where: { author_id: author.id }, select: { id: true } });
      bks.forEach((b) => ids.add(b.id));
    }
  } else if (role === "translator") {
    const translator = await prisma.translator.findFirst({ where: { user_id: userId } });
    if (translator) {
      const bks = await prisma.book.findMany({ where: { translator_id: translator.id }, select: { id: true } });
      bks.forEach((b) => ids.add(b.id));
    }
  } else if (role === "publisher") {
    const publisher = await prisma.publisher.findFirst({ where: { user_id: userId } });
    if (publisher) {
      const bksByPub = await prisma.book.findMany({ where: { publisher_id: publisher.id }, select: { id: true } });
      bksByPub.forEach((b) => ids.add(b.id));
      const fmtsByPub = await prisma.bookFormat.findMany({ where: { publisher_id: publisher.id }, select: { book_id: true } });
      fmtsByPub.forEach((f) => ids.add(f.book_id));
    }
  }

  return ids;
}

/**
 * Ownership check for direct book-mutating endpoints (updateBook,
 * submitBookForReview) — these used to check only Book.submitted_by, which
 * wrongly rejected legitimate owners who reached the book via a
 * BookContributor assignment or a linked Author/Narrator/Publisher/
 * Translator catalog entity instead (the other two sources
 * getCreatorBookIds already unions for listing purposes). When `format` is
 * known it narrows which role(s) are plausible; omit it to check all of
 * them (e.g. submitBookForReview, which isn't format-specific).
 */
export async function userOwnsBook(
  userId: string,
  bookId: string,
  format?: "ebook" | "audiobook" | "hardcopy"
): Promise<boolean> {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { submitted_by: true } });
  if (!book) return false;
  if (book.submitted_by === userId) return true;

  const candidateRoles: CreatorRole[] =
    format === "audiobook" ? ["narrator"] :
    format === "hardcopy" ? ["publisher"] :
    format === "ebook" ? ["writer", "translator"] :
    ["writer", "narrator", "publisher", "translator"];

  for (const role of candidateRoles) {
    const ids = await getCreatorBookIds(userId, role);
    if (ids.has(bookId)) return true;
  }
  return false;
}
