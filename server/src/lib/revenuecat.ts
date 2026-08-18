import { prisma } from "./prisma.js";

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

interface RevenueCatGatewayConfig {
  secret_api_key?: string;
}

async function getGatewayConfig(): Promise<{ enabled: boolean; secretApiKey: string | null; liveMode: boolean }> {
  // Self-heals: ensures the admin panel's Payment Gateways page always has a
  // row to configure, without needing a one-off seed script or migration.
  const gateway = await prisma.paymentGateway.upsert({
    where: { gateway_key: "revenuecat" },
    create: { gateway_key: "revenuecat", label: "RevenueCat (Apple IAP)", is_enabled: false, config: {} },
    update: {},
  });

  const config = (gateway.config ?? {}) as RevenueCatGatewayConfig;
  const secretApiKey = config.secret_api_key?.trim() || process.env.REVENUECAT_SECRET_API_KEY || null;
  // Same "mode" toggle SSLCommerz already uses (gateway.mode: "live"|"test")
  // — unset/"test" allows sandbox purchases through (mobile QA hitting the
  // real production API against a sandbox/TestFlight Apple or Google
  // account is normal), "live" rejects them.
  const liveMode = gateway.mode === "live";

  return { enabled: gateway.is_enabled, secretApiKey, liveMode };
}

export async function isRevenueCatConfigured(): Promise<boolean> {
  const { enabled, secretApiKey } = await getGatewayConfig();
  return enabled && Boolean(secretApiKey);
}

interface NonSubscriptionEntry {
  id: string;
  store_transaction_id?: string;
  purchase_date?: string;
  store?: string;
  is_sandbox?: boolean;
}

interface SubscriptionEntry {
  store_transaction_id?: string;
  purchase_date?: string;
  expires_date?: string;
  store?: string;
  is_sandbox?: boolean;
}

export interface RevenueCatVerifyResult {
  ok: boolean;
  error?: string;
  matchedEntry?: NonSubscriptionEntry;
  rawSubscriber?: unknown;
}

export interface RevenueCatSubscriptionVerifyResult {
  ok: boolean;
  error?: string;
  matchedEntry?: SubscriptionEntry;
  rawSubscriber?: unknown;
}

interface SubscriberData {
  subscriber?: {
    subscriptions?: Record<string, SubscriptionEntry>;
    non_subscriptions?: Record<string, NonSubscriptionEntry[]>;
  };
}

// A flat (not discriminated-union) shape on purpose — this project's
// tsconfig runs with strict:false, under which TS doesn't reliably narrow
// `if (!x.ok) return x.error` against a `{ok:true,...}|{ok:false,error}`
// union. error/data are simply optional on the one shape instead.
interface FetchSubscriberResult {
  ok: boolean;
  error?: string;
  liveMode: boolean;
  data?: SubscriberData;
}

async function fetchSubscriber(appUserId: string): Promise<FetchSubscriberResult> {
  const { enabled, secretApiKey, liveMode } = await getGatewayConfig();
  if (!enabled || !secretApiKey) {
    return { ok: false, error: "RevenueCat is not configured", liveMode };
  }

  const res = await fetch(`${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretApiKey}` },
  });

  if (!res.ok) {
    return { ok: false, error: `RevenueCat lookup failed (${res.status})`, liveMode };
  }

  const data = (await res.json()) as SubscriberData;
  return { ok: true, liveMode, data };
}

/**
 * Verifies an IAP one-time purchase (book/chapter unlock) by asking
 * RevenueCat for the subscriber's purchase history and checking for a
 * matching non-subscription (consumable) entry. Assumes the Flutter app
 * initializes RevenueCat with `appUserID = <our own user id>` (RevenueCat's
 * "Identifying Users" pattern) — otherwise app_user_id below won't line up
 * with anything RevenueCat has seen.
 */
export async function verifyRevenueCatTransaction(
  appUserId: string,
  transactionId: string,
  productId?: string
): Promise<RevenueCatVerifyResult> {
  const fetched = await fetchSubscriber(appUserId);
  if (!fetched.ok || !fetched.data) return { ok: false, error: fetched.error };

  const nonSubscriptions = fetched.data.subscriber?.non_subscriptions ?? {};
  const candidateLists = productId ? [nonSubscriptions[productId] ?? []] : Object.values(nonSubscriptions);

  for (const list of candidateLists) {
    const match = list.find(
      (entry) => entry.id === transactionId || entry.store_transaction_id === transactionId
    );
    if (match) {
      if (fetched.liveMode && match.is_sandbox) {
        return { ok: false, error: "Sandbox purchases are not accepted in production", rawSubscriber: fetched.data };
      }
      return { ok: true, matchedEntry: match, rawSubscriber: fetched.data };
    }
  }

  return { ok: false, error: "No matching purchase found for this transaction", rawSubscriber: fetched.data };
}

/**
 * Verifies an IAP subscription purchase (subscribe-iap) — checks
 * subscriber.subscriptions[product_id] for a matching, still-active entry:
 * store_transaction_id matches, expires_date is in the future, and (in live
 * mode) is_sandbox is false.
 */
export async function verifyRevenueCatSubscription(
  appUserId: string,
  transactionId: string,
  productId: string
): Promise<RevenueCatSubscriptionVerifyResult> {
  const fetched = await fetchSubscriber(appUserId);
  if (!fetched.ok || !fetched.data) return { ok: false, error: fetched.error };

  const entry = fetched.data.subscriber?.subscriptions?.[productId];
  if (!entry) {
    return { ok: false, error: "No matching subscription found for this product", rawSubscriber: fetched.data };
  }
  if (entry.store_transaction_id !== transactionId) {
    return { ok: false, error: "Transaction ID does not match RevenueCat's record for this subscription", rawSubscriber: fetched.data };
  }
  if (!entry.expires_date || new Date(entry.expires_date).getTime() <= Date.now()) {
    return { ok: false, error: "This subscription has already expired", rawSubscriber: fetched.data };
  }
  if (fetched.liveMode && entry.is_sandbox) {
    return { ok: false, error: "Sandbox purchases are not accepted in production", rawSubscriber: fetched.data };
  }

  return { ok: true, matchedEntry: entry, rawSubscriber: fetched.data };
}
