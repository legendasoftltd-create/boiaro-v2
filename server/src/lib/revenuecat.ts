import { prisma } from "./prisma.js";

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

interface RevenueCatGatewayConfig {
  secret_api_key?: string;
}

async function getGatewayConfig(): Promise<{ enabled: boolean; secretApiKey: string | null }> {
  // Self-heals: ensures the admin panel's Payment Gateways page always has a
  // row to configure, without needing a one-off seed script or migration.
  const gateway = await prisma.paymentGateway.upsert({
    where: { gateway_key: "revenuecat" },
    create: { gateway_key: "revenuecat", label: "RevenueCat (Apple IAP)", is_enabled: false, config: {} },
    update: {},
  });

  const config = (gateway.config ?? {}) as RevenueCatGatewayConfig;
  const secretApiKey = config.secret_api_key?.trim() || process.env.REVENUECAT_SECRET_API_KEY || null;

  return { enabled: gateway.is_enabled, secretApiKey };
}

export async function isRevenueCatConfigured(): Promise<boolean> {
  const { enabled, secretApiKey } = await getGatewayConfig();
  return enabled && Boolean(secretApiKey);
}

interface NonSubscriptionEntry {
  id: string;
  store_transaction_id?: string;
  purchase_date?: string;
  is_sandbox?: boolean;
}

export interface RevenueCatVerifyResult {
  ok: boolean;
  error?: string;
  matchedEntry?: NonSubscriptionEntry;
  rawSubscriber?: unknown;
}

/**
 * Verifies an Apple IAP transaction by asking RevenueCat for the subscriber's
 * purchase history and checking for a matching non-subscription (consumable)
 * entry. Assumes the Flutter app initializes RevenueCat with
 * `appUserID = <our own user id>` (RevenueCat's "Identifying Users" pattern) —
 * otherwise app_user_id below won't line up with anything RevenueCat has seen.
 */
export async function verifyRevenueCatTransaction(
  appUserId: string,
  transactionId: string,
  productId?: string
): Promise<RevenueCatVerifyResult> {
  const { enabled, secretApiKey } = await getGatewayConfig();
  if (!enabled || !secretApiKey) {
    return { ok: false, error: "RevenueCat is not configured" };
  }

  const res = await fetch(`${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretApiKey}` },
  });

  if (!res.ok) {
    return { ok: false, error: `RevenueCat lookup failed (${res.status})` };
  }

  const data = (await res.json()) as {
    subscriber?: { non_subscriptions?: Record<string, NonSubscriptionEntry[]> };
  };
  const nonSubscriptions = data.subscriber?.non_subscriptions ?? {};

  const candidateLists = productId ? [nonSubscriptions[productId] ?? []] : Object.values(nonSubscriptions);

  for (const list of candidateLists) {
    const match = list.find(
      (entry) => entry.id === transactionId || entry.store_transaction_id === transactionId
    );
    if (match) {
      return { ok: true, matchedEntry: match, rawSubscriber: data };
    }
  }

  return { ok: false, error: "No matching purchase found for this transaction", rawSubscriber: data };
}
