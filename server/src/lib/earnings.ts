import { prisma } from "./prisma.js";

interface EarningParams {
  bookId: string;
  format: string;
  saleAmount: number;
  orderId?: string | null;
  orderItemId?: string | null;
  contentUnlockId?: string | null;
}

/**
 * Calculates and creates ContributorEarning records for each contributor
 * (writer, narrator, publisher) using the FormatRevenueSplit override or
 * DefaultRevenueRule for the book's format.
 *
 * Called after a digital purchase is confirmed (placeOrder) or a coin unlock.
 * For hardcopy, called when order status moves to confirmed/delivered.
 */
export async function calculateEarnings(params: EarningParams): Promise<void> {
  const { bookId, format, saleAmount, orderId, orderItemId, contentUnlockId } = params;

  if (saleAmount <= 0) return;

  // 1. Get revenue split rule: per-book override → default rule
  const [override, defaultRule, contributors] = await Promise.all([
    prisma.formatRevenueSplit.findFirst({
      where: { book_id: bookId, format },
    }),
    prisma.defaultRevenueRule.findFirst({
      where: { format },
    }),
    prisma.bookContributor.findMany({
      where: {
        book_id: bookId,
        OR: [{ format }, { format: null }],
      },
    }),
  ]);

  const rule = override
    ? {
        writer: override.writer_pct,
        narrator: override.narrator_pct,
        publisher: override.publisher_pct,
        fulfillment: override.fulfillment_cost_pct,
        platform: override.platform_pct,
      }
    : defaultRule
    ? {
        writer: defaultRule.writer_percentage,
        narrator: defaultRule.narrator_percentage,
        publisher: defaultRule.publisher_percentage,
        fulfillment: defaultRule.fulfillment_cost_percentage,
        platform: defaultRule.platform_percentage,
      }
    : null;

  if (!rule) return; // no rule defined — skip silently

  const fulfillmentAmount = (saleAmount * rule.fulfillment) / 100;

  // Build per-role earnings map. Multiple contributors of the same role share equally.
  type Role = "writer" | "narrator" | "publisher";
  const roleMap: Record<Role, typeof contributors> = { writer: [], narrator: [], publisher: [] };

  for (const c of contributors) {
    const r = c.role as Role;
    if (r in roleMap) roleMap[r].push(c);
  }

  const earningData: {
    user_id: string;
    book_id: string;
    format: string;
    role: string;
    sale_amount: number;
    earned_amount: number;
    percentage: number;
    fulfillment_amount: number;
    order_id: string | null;
    order_item_id: string | null;
    content_unlock_id: string | null;
    status: string;
  }[] = [];

  for (const [role, list] of Object.entries(roleMap) as [Role, typeof contributors][]) {
    const rolePct = rule[role];
    if (!rolePct || rolePct <= 0) continue;
    if (list.length === 0) continue;

    // Split the role percentage equally among multiple contributors of the same role
    const perContributorPct = rolePct / list.length;
    const perContributorAmount = (saleAmount * perContributorPct) / 100;

    for (const contributor of list) {
      earningData.push({
        user_id: contributor.user_id,
        book_id: bookId,
        format,
        role,
        sale_amount: saleAmount,
        earned_amount: Math.round(perContributorAmount * 100) / 100,
        percentage: perContributorPct,
        fulfillment_amount: fulfillmentAmount,
        order_id: orderId ?? null,
        order_item_id: orderItemId ?? null,
        content_unlock_id: contentUnlockId ?? null,
        status: "pending",
      });
    }
  }

  const platformUserId = "00000000-0000-0000-0000-000000000000";
  const undistributedPct =
    (roleMap.writer.length === 0 ? Number(rule.writer || 0) : 0) +
    (roleMap.narrator.length === 0 ? Number(rule.narrator || 0) : 0) +
    (roleMap.publisher.length === 0 ? Number(rule.publisher || 0) : 0);
  const effectivePlatformPct = Number(rule.platform || 0) + undistributedPct;
  if (effectivePlatformPct > 0) {
    earningData.push({
      user_id: platformUserId,
      book_id: bookId,
      format,
      role: "platform",
      sale_amount: saleAmount,
      earned_amount: Math.round(((saleAmount * effectivePlatformPct) / 100) * 100) / 100,
      percentage: effectivePlatformPct,
      fulfillment_amount: fulfillmentAmount,
      order_id: orderId ?? null,
      order_item_id: orderItemId ?? null,
      content_unlock_id: contentUnlockId ?? null,
      status: "pending",
    });
  }

  if (earningData.length > 0) {
    try {
      await prisma.contributorEarning.createMany({ data: earningData });
    } catch (error: any) {
      const missingColumn = String(error?.meta?.driverAdapterError?.cause?.column || "");
      if (error?.code === "P2022" && missingColumn.includes("content_unlock_id")) {
        const fallbackData = earningData.map(({ content_unlock_id: _unused, ...rest }) => rest);
        await prisma.contributorEarning.createMany({ data: fallbackData as any });
        return;
      }
      throw error;
    }
  }
}
