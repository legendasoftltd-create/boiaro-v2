import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/index.js";
import * as redx from "../src/services/redx.service.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Options = {
  ids: string[];
  orderNumbers: string[];
  userId?: string;
  statuses: string[];
  paymentMethods: string[];
  createdBefore?: Date;
  createdAfter?: Date;
  all: boolean;
  execute: boolean;
  revokeDigitalAccess: boolean;
  keepWalletEffects: boolean;
  cancelRedx: boolean;
  limit: number;
};

function usage(): string {
  return `
Clean orders and dependent records.

Dry-run by default. Add --execute to delete.

Examples:
  npm run clean:orders -- --id order-id-1,order-id-2
  npm run clean:orders -- --order-number ORD-123,ORD-456 --execute
  npm run clean:orders -- --user-id user-id --status pending --created-before 2026-05-01
  npm run clean:orders -- --payment-method demo --created-after 2026-04-01 --execute
  npm run clean:orders -- --all --limit 100 --execute

Options:
  --id <ids>                 Comma-separated order IDs.
  --order-number <numbers>   Comma-separated order numbers.
  --user-id <id>             Limit to a user.
  --status <statuses>        Comma-separated statuses.
  --payment-method <methods> Comma-separated payment methods.
  --created-before <date>    ISO date/time.
  --created-after <date>     ISO date/time.
  --limit <number>           Max orders to clean. Default: 100.
  --all                      Allow selecting all orders, usually with filters.
  --revoke-digital-access    Remove purchase/unlock records for selected digital order items when no other verified order grants the same access.
  --keep-wallet-effects      Do not refund wallet coins spent by selected wallet orders.
  --skip-redx-cancel         Do not call RedX cancel before deleting orders.
  --execute                  Actually delete records.
`.trim();
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDate(value: string, flag: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${flag} must be a valid date`);
  return date;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    ids: [],
    orderNumbers: [],
    statuses: [],
    paymentMethods: [],
    all: false,
    execute: false,
    revokeDigitalAccess: false,
    keepWalletEffects: false,
    cancelRedx: true,
    limit: 100,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      case "--id":
        options.ids.push(...splitList(readValue(argv, i, arg)));
        i++;
        break;
      case "--order-number":
        options.orderNumbers.push(...splitList(readValue(argv, i, arg)));
        i++;
        break;
      case "--user-id":
        options.userId = readValue(argv, i, arg);
        i++;
        break;
      case "--status":
        options.statuses.push(...splitList(readValue(argv, i, arg)));
        i++;
        break;
      case "--payment-method":
        options.paymentMethods.push(...splitList(readValue(argv, i, arg)));
        i++;
        break;
      case "--created-before":
        options.createdBefore = parseDate(readValue(argv, i, arg), arg);
        i++;
        break;
      case "--created-after":
        options.createdAfter = parseDate(readValue(argv, i, arg), arg);
        i++;
        break;
      case "--limit": {
        const limit = Number(readValue(argv, i, arg));
        if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit must be a positive integer");
        options.limit = limit;
        i++;
        break;
      }
      case "--all":
        options.all = true;
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--revoke-digital-access":
        options.revokeDigitalAccess = true;
        break;
      case "--keep-wallet-effects":
        options.keepWalletEffects = true;
        break;
      case "--skip-redx-cancel":
        options.cancelRedx = false;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function buildOrderWhere(options: Options): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  const or: Prisma.OrderWhereInput[] = [];

  if (options.ids.length > 0) or.push({ id: { in: options.ids } });
  if (options.orderNumbers.length > 0) or.push({ order_number: { in: options.orderNumbers } });
  if (or.length > 0) and.push({ OR: or });
  if (options.userId) and.push({ user_id: options.userId });
  if (options.statuses.length > 0) and.push({ status: { in: options.statuses } });
  if (options.paymentMethods.length > 0) and.push({ payment_method: { in: options.paymentMethods } });

  if (options.createdBefore || options.createdAfter) {
    and.push({
      created_at: {
        ...(options.createdAfter ? { gte: options.createdAfter } : {}),
        ...(options.createdBefore ? { lt: options.createdBefore } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function requireSelector(options: Options) {
  const hasSelector =
    options.ids.length > 0 ||
    options.orderNumbers.length > 0 ||
    Boolean(options.userId) ||
    options.statuses.length > 0 ||
    options.paymentMethods.length > 0 ||
    Boolean(options.createdBefore) ||
    Boolean(options.createdAfter);

  if (!hasSelector && !options.all) {
    throw new Error("Refusing to select orders without a filter. Add filters or use --all.");
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function countTargets(orderIds: string[]) {
  const shipmentIds = (
    await prisma.shipment.findMany({
      where: { order_id: { in: orderIds } },
      select: { id: true },
    })
  ).map((shipment) => shipment.id);

  const [
    orderItems,
    statusHistory,
    payments,
    paymentEvents,
    couponUsage,
    contributorEarnings,
    ledger,
    shipments,
    shipmentEvents,
    walletTransactions,
  ] = await Promise.all([
    prisma.orderItem.count({ where: { order_id: { in: orderIds } } }),
    prisma.orderStatusHistory.count({ where: { order_id: { in: orderIds } } }),
    prisma.payment.count({ where: { order_id: { in: orderIds } } }),
    prisma.paymentEvent.count({ where: { order_id: { in: orderIds } } }),
    prisma.couponUsage.count({ where: { order_id: { in: orderIds } } }),
    prisma.contributorEarning.count({ where: { order_id: { in: orderIds } } }),
    prisma.accountingLedger.count({
      where: { OR: [{ order_id: { in: orderIds } }, { reference_id: { in: orderIds } }] },
    }),
    prisma.shipment.count({ where: { order_id: { in: orderIds } } }),
    shipmentIds.length > 0 ? prisma.shipmentEvent.count({ where: { shipment_id: { in: shipmentIds } } }) : 0,
    prisma.coinTransaction.count({
      where: { source: "order_payment", reference_id: { in: orderIds } },
    }),
  ]);

  return {
    orders: orderIds.length,
    orderItems,
    statusHistory,
    payments,
    paymentEvents,
    couponUsage,
    contributorEarnings,
    ledger,
    shipments,
    shipmentEvents,
    walletTransactions,
  };
}

async function getDigitalAccessRevocations(orderIds: string[]) {
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order_id: { in: orderIds },
      format: { in: ["ebook", "audiobook"] },
      book_id: { not: null },
    },
    select: {
      book_id: true,
      format: true,
      order: { select: { user_id: true } },
    },
  });

  const candidates = unique(
    orderItems
      .filter((item): item is typeof item & { book_id: string } => Boolean(item.book_id))
      .map((item) => `${item.order.user_id}:${item.book_id}:${item.format}`)
  ).map((key) => {
    const [userId, bookId, format] = key.split(":");
    return { userId, bookId, format };
  });

  const revocations: typeof candidates = [];
  for (const candidate of candidates) {
    const otherPaidOrder = await prisma.order.findFirst({
      where: {
        id: { notIn: orderIds },
        user_id: candidate.userId,
        status: { in: ["confirmed", "paid", "completed", "delivered"] },
        items: {
          some: {
            book_id: candidate.bookId,
            format: candidate.format as any,
          },
        },
      },
      select: { id: true },
    });

    if (!otherPaidOrder) revocations.push(candidate);
  }

  return revocations;
}

async function cancelRedxParcels(orderIds: string[]) {
  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      redx_tracking_id: { not: null },
      status: { notIn: ["delivered", "returned", "cancelled"] },
    },
    select: { order_number: true, redx_tracking_id: true },
  });

  for (const order of orders) {
    if (!order.redx_tracking_id) continue;
    try {
      await redx.cancelParcel(order.redx_tracking_id, "Cleaned by admin cleanup script");
      console.log(`Cancelled RedX parcel for ${order.order_number}: ${order.redx_tracking_id}`);
    } catch (error) {
      console.warn(`Could not cancel RedX parcel for ${order.order_number}:`, error);
    }
  }
}

async function cleanOrders(options: Options) {
  requireSelector(options);

  const where = buildOrderWhere(options);
  const orders = await prisma.order.findMany({
    where,
    orderBy: { created_at: "asc" },
    take: options.limit,
    select: {
      id: true,
      order_number: true,
      user_id: true,
      status: true,
      payment_method: true,
      total_amount: true,
      created_at: true,
    },
  });

  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) {
    console.log("No orders matched.");
    return;
  }

  const counts = await countTargets(orderIds);
  const digitalRevocations = options.revokeDigitalAccess ? await getDigitalAccessRevocations(orderIds) : [];

  console.log(`Matched ${orders.length} order(s):`);
  for (const order of orders.slice(0, 20)) {
    console.log(
      `  ${order.order_number} | ${order.id} | ${order.status || "null"} | ${order.payment_method || "null"} | ${order.created_at.toISOString()} | amount=${order.total_amount ?? 0}`
    );
  }
  if (orders.length > 20) console.log(`  ...and ${orders.length - 20} more`);

  console.log("\nDependent records:");
  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name}: ${count}`);
  }
  if (options.revokeDigitalAccess) {
    console.log(`  digitalAccessRevocations: ${digitalRevocations.length}`);
  }

  if (!options.execute) {
    console.log("\nDry run only. Re-run with --execute to delete.");
    return;
  }

  if (options.cancelRedx) {
    await cancelRedxParcels(orderIds);
  }

  const result = await prisma.$transaction(async (tx) => {
    const walletTransactions = await tx.coinTransaction.findMany({
      where: { source: "order_payment", reference_id: { in: orderIds }, amount: { lt: 0 } },
      select: { user_id: true, amount: true },
    });

    if (!options.keepWalletEffects) {
      const refundByUser = new Map<string, number>();
      for (const transaction of walletTransactions) {
        refundByUser.set(transaction.user_id, (refundByUser.get(transaction.user_id) ?? 0) + Math.abs(transaction.amount));
      }
      for (const [userId, refund] of refundByUser) {
        await tx.userCoin.updateMany({
          where: { user_id: userId },
          data: {
            balance: { increment: refund },
            total_spent: { decrement: refund },
          },
        });
      }
    }

    for (const access of digitalRevocations) {
      await tx.userPurchase.deleteMany({
        where: {
          user_id: access.userId,
          book_id: access.bookId,
          format: access.format,
          payment_method: { in: ["demo", "bkash", "nagad", "sslcommerz", "wallet", "coins"] },
        },
      });
      await tx.contentUnlock.deleteMany({
        where: {
          user_id: access.userId,
          book_id: access.bookId,
          format: access.format,
          unlock_method: "purchase",
        },
      });
    }

    const shipments = await tx.shipment.findMany({
      where: { order_id: { in: orderIds } },
      select: { id: true },
    });
    const shipmentIds = shipments.map((shipment) => shipment.id);

    const deleted = {
      paymentEvents: await tx.paymentEvent.deleteMany({ where: { order_id: { in: orderIds } } }),
      ledger: await tx.accountingLedger.deleteMany({
        where: { OR: [{ order_id: { in: orderIds } }, { reference_id: { in: orderIds } }] },
      }),
      contributorEarnings: await tx.contributorEarning.deleteMany({ where: { order_id: { in: orderIds } } }),
      couponUsage: await tx.couponUsage.deleteMany({ where: { order_id: { in: orderIds } } }),
      payments: await tx.payment.deleteMany({ where: { order_id: { in: orderIds } } }),
      statusHistory: await tx.orderStatusHistory.deleteMany({ where: { order_id: { in: orderIds } } }),
      shipmentEvents:
        shipmentIds.length > 0 ? await tx.shipmentEvent.deleteMany({ where: { shipment_id: { in: shipmentIds } } }) : { count: 0 },
      shipments: await tx.shipment.deleteMany({ where: { order_id: { in: orderIds } } }),
      walletTransactions: await tx.coinTransaction.deleteMany({
        where: { source: "order_payment", reference_id: { in: orderIds } },
      }),
      orderItems: await tx.orderItem.deleteMany({ where: { order_id: { in: orderIds } } }),
      orders: await tx.order.deleteMany({ where: { id: { in: orderIds } } }),
    };

    return deleted;
  });

  console.log("\nDeleted records:");
  for (const [name, value] of Object.entries(result)) {
    console.log(`  ${name}: ${value.count}`);
  }
  if (options.revokeDigitalAccess) {
    console.log(`  digitalAccessRevocations: ${digitalRevocations.length}`);
  }
}

cleanOrders(parseArgs(process.argv.slice(2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    console.error("");
    console.error(usage());
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
