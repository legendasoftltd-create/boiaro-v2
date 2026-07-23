import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

export const getAllNarrators = async (userId?: string | null, search?: string) => {
  const narrators = await prisma.narrator.findMany({
    where: {
      status: "active",
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { name_en: { contains: search, mode: "insensitive" as const } }] }
        : {}),
    },
    orderBy: [
      {
        is_featured: "desc",
      },
      {
        is_trending: "desc",
      },
      {
        rating: "desc",
      },
      {
        created_at: "desc",
      },
    ],
    select: {
      id: true,
      name: true,
      name_en: true,
      avatar_url: true,
      bio: true,
      specialty: true,
      rating: true,
      is_featured: true,
      is_trending: true,
    },
  });

  let followedNarratorIds = new Set<string>();
  if (userId && narrators.length > 0) {
    const follows = await prisma.follow.findMany({
      where: {
        follower_id: userId,
        followee_id: { in: narrators.map((narrator) => narrator.id) },
      },
      select: { followee_id: true },
    });
    followedNarratorIds = new Set(follows.map((follow) => follow.followee_id));
  }

  const formats = await prisma.bookFormat.findMany({
    where: { format: "audiobook", is_available: true, submission_status: "approved" },
    select: { book_id: true, narrator_id: true, narrator_ids: true },
  });
  const bookIdsByNarrator: Record<string, Set<string>> = {};
  formats.forEach((f) => {
    const ids = [f.narrator_id, ...f.narrator_ids].filter((id): id is string => !!id);
    ids.forEach((id) => {
      (bookIdsByNarrator[id] ??= new Set()).add(f.book_id);
    });
  });
  const allBookIds = [...new Set(formats.map((f) => f.book_id))];
  const listenRows = allBookIds.length > 0
    ? await prisma.book.findMany({ where: { id: { in: allBookIds } }, select: { id: true, total_listens: true } })
    : [];
  const listensByBookId = new Map(listenRows.map((b) => [b.id, b.total_listens || 0]));

  return {
    narrators: narrators.map((narrator) => {
      const bookIds = [...(bookIdsByNarrator[narrator.id] || [])];
      const total_listens = bookIds.reduce((sum, id) => sum + (listensByBookId.get(id) || 0), 0);
      return {
        ...narrator,
        avatar_url: resolveFileUrl(narrator.avatar_url),
        followed: followedNarratorIds.has(narrator.id),
        audiobooks_count: bookIds.length,
        total_listens,
      };
    }),
  };
};

export const getNarratorById = async (id: string, userId?: string | null) => {
  const [narrator, followers_count, audiobookFormats, followRow] = await Promise.all([
    prisma.narrator.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        name_en: true,
        avatar_url: true,
        bio: true,
        specialty: true,
        rating: true,
        is_featured: true,
        is_trending: true,
      },
    }),
    prisma.follow.count({ where: { followee_id: id } }),
    prisma.bookFormat.findMany({
      where: { OR: [{ narrator_id: id }, { narrator_ids: { has: id } }] },
      select: { book_id: true },
    }),
    userId
      ? prisma.follow.findFirst({ where: { follower_id: userId, followee_id: id }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (!narrator) return { error: "Narrator not found" };

  const bookIds = [...new Set(audiobookFormats.map((f) => f.book_id))];
  const listenRows = bookIds.length > 0
    ? await prisma.book.findMany({ where: { id: { in: bookIds } }, select: { total_listens: true } })
    : [];
  const total_listens = listenRows.reduce((sum, b) => sum + (b.total_listens || 0), 0);

  return {
    ...narrator,
    avatar_url: resolveFileUrl(narrator.avatar_url),
    followers_count,
    books_count: bookIds.length,
    total_listens,
    is_following: !!followRow,
  };
};
