import type { Prisma } from "../generated/prisma/index.js";
import { prisma as defaultPrisma } from "./prisma.js";

type Client = typeof defaultPrisma | Prisma.TransactionClient;

/**
 * A user's own account picture lives on Profile.avatar_url, but readers
 * never see that table — the book detail byline and public /author,
 * /publisher, /narrator, /translator pages all read from the separate
 * catalog tables (Author/Publisher/Narrator/Translator), which only get
 * linked to a real account via an admin action (user_id). Call this
 * whenever a creator updates their own avatar so the picture readers
 * actually see stays in sync. user_id isn't unique on those tables (a
 * catalog entity is linked, not owned 1:1 in the schema), so this uses
 * updateMany — a no-op if the account was never admin-linked to a catalog
 * entity.
 */
export async function syncCreatorAvatar(userId: string, avatarUrl: string, tx: Client = defaultPrisma): Promise<void> {
  await Promise.all([
    tx.author.updateMany({ where: { user_id: userId }, data: { avatar_url: avatarUrl } }),
    tx.translator.updateMany({ where: { user_id: userId }, data: { avatar_url: avatarUrl } }),
    tx.narrator.updateMany({ where: { user_id: userId }, data: { avatar_url: avatarUrl } }),
    tx.publisher.updateMany({ where: { user_id: userId }, data: { logo_url: avatarUrl } }),
  ]);
}
