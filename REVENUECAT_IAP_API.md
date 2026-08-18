# RevenueCat (Apple/Google IAP) — Backend Integration

Apple/Google's purchase sheet runs client-side (RevenueCat SDK). The Flutter
app then sends the resulting transaction to one of the three endpoints
below, which **re-verifies it against RevenueCat's own records** before
activating anything — the transaction id from the app is never trusted on
its own.

Base URL: `https://boiaro.com/api/v1` (see [REST_API.md](REST_API.md) for
auth headers and the response envelope — this doc only covers IAP).

---

## 1. Required setup before this works

### RevenueCat must be configured with `appUserID = our internal user id`

This backend verifies a purchase by asking RevenueCat: *"what has this
app_user_id bought?"* — using **our own `user_id`** (the same id in the JWT
this API already issues) as the lookup key. That only works if the Flutter
app initializes RevenueCat like this, right after our own login:

```dart
await Purchases.logIn(ourUserId); // ourUserId = the same id used for Authorization: Bearer <token>
```

If RevenueCat is left on its own anonymous ID instead, verification will
always fail (RevenueCat won't have any purchase history under our
`user_id`). This is RevenueCat's documented
["Identifying Users"](https://docs.revenuecat.com/docs/user-ids) pattern —
not something invented for this integration.

### Admin panel — Payment Gateways → RevenueCat (Apple IAP)

A gateway row appears automatically (self-seeding, no migration/seed script
needed). Open it and:
1. Paste the **Secret API Key** from the RevenueCat dashboard (Project
   Settings → API Keys → **secret** key, not the public SDK key).
2. Toggle it **Enabled**.
3. Set **Mode**:
   - **Test** — sandbox purchases (TestFlight, Google Play internal
     testing) are accepted. Use this while your mobile team is testing IAP
     against this backend before public release.
   - **Live** — sandbox purchases are rejected outright (`402`). Switch to
     this before/at public launch, or every sandbox test purchase your QA
     team makes will silently activate real unlocks/subscriptions in
     production.

Until the key is set and the gateway is enabled, every IAP call below
returns `402 { "error": "RevenueCat is not configured" }`.

---

## 2. Endpoints

### `POST /subscriptions/subscribe-iap` — activate a subscription

**Auth:** `Authorization: Bearer <access_token>`

```json
{
  "plan_id": "uuid",
  "transaction_id": "GPA.3388-1234-5678-00000",
  "product_id": "premium_monthly",
  "payment_method": "playstore",
  "platform": "android"
}
```

| Field | Required | Notes |
| :--- | :--- | :--- |
| `plan_id` | ✅ | Must match an active `SubscriptionPlan` in our DB. |
| `transaction_id` | ✅ | Apple/Google's store transaction id for this purchase. |
| `product_id` | ✅ | The RevenueCat/store product id — required here (unlike the unlock endpoints, where it's just recommended), since subscription lookup is keyed by product. |
| `payment_method` | optional | `"appstore"` or `"playstore"` — recorded on the `Payment` row for revenue reporting. |
| `platform` | optional | `"ios"` or `"android"`. |

Success (`201`):
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "plan_id": "uuid",
    "status": "active",
    "start_date": "2026-08-18T12:00:00.000Z",
    "end_date": "2026-09-18T12:00:00.000Z",
    "store": "play_store",
    "is_sandbox": false
  }
}
```

If this exact `transaction_id` was already used to activate this same
user's subscription to this same plan, replaying the request returns
`200 { "success": true, "already_processed": true, "subscription": {...} }`
instead of erroring — safe to retry after a network timeout.

Error responses:

| Status | Body | Meaning |
| :--- | :--- | :--- |
| `400` | `{ "error": "plan_id, transaction_id, and product_id are required" }` | Missing a required field |
| `404` | `{ "error": "Subscription plan not found or inactive" }` | Bad `plan_id` |
| `409` | `{ "error": "Transaction already used" }` | This `transaction_id` was already used for a *different* user/plan — replay/fraud rejection |
| `409` | `{ "error": "You already have an active subscription to this plan." }` | Duplicate subscribe to the same plan |
| `409` | `{ "error": "You have a cancelled subscription that is still valid. You can re-subscribe after it expires." }` | Grace-period block, same rule `POST /subscriptions/subscribe` already enforces |
| `402` | `{ "error": "Could not verify subscription purchase" }` (or a more specific RevenueCat error — see §3) | Verification against RevenueCat failed |

Subscribing to a **different** plan while one is already active is treated
as a plan switch: the old subscription is marked `replaced` and the new one
takes over immediately, same as the existing `POST /subscriptions/subscribe`
flow.

This is a **new, separate** endpoint — the existing `POST
/subscriptions/subscribe` (SSLCommerz, free plans) is unchanged and still
handles everything it always did.

---

### `POST /books/:bookId/unlock-iap` — unlock a full eBook/Audiobook

**Auth:** `Authorization: Bearer <access_token>`

```json
{
  "transaction_id": "2000000123456789",
  "product_id": "ebook_tier_1",
  "format": "ebook",
  "platform": "ios"
}
```

| Field | Required | Notes |
| :--- | :--- | :--- |
| `transaction_id` | ✅ | Apple/Google's transaction id for the completed purchase. |
| `product_id` | recommended | Without it, verification searches every consumable product on file for that user instead of just the one purchased — slightly slower, slightly less precise. |
| `format` | ✅ | `"ebook"` or `"audiobook"`. A book can have both, unlocked independently. |
| `platform` | optional | `"ios"` or `"android"` — recorded on the transaction ledger. |

Success (`200`):
```json
{ "success": true, "already_unlocked": false, "book_id": "uuid", "message": "Full book unlocked successfully" }
```

---

### `POST /chapters/:trackId/unlock-iap` — unlock a single chapter

**Auth:** `Authorization: Bearer <access_token>`

```json
{
  "book_id": "uuid",
  "transaction_id": "2000000123456789",
  "product_id": "chapter_tier_1",
  "platform": "ios"
}
```

Same field meanings as the book endpoint above, plus `book_id` (the book
this chapter belongs to — matches the existing `/initiate-payment`/
`/unlock-coin` convention).

Success (`200`):
```json
{ "success": true, "already_unlocked": false, "track_id": "uuid", "book_id": "uuid", "message": "Book unlocked successfully" }
```

### Shared error responses (both unlock-iap endpoints)

| Status | Body | Meaning |
| :--- | :--- | :--- |
| `402` | `{ "error": "RevenueCat is not configured" }` | Admin hasn't set up the gateway yet |
| `402` | `{ "error": "No matching purchase found for this transaction" }` | RevenueCat has no record of this transaction for this user |
| `402` | `{ "error": "Sandbox purchases are not accepted in production" }` | Gateway is in **Live** mode and this was a sandbox/TestFlight purchase |
| `404` | `{ "error": "Chapter not found" }` / `{ "error": "Book not found" }` | Bad `track_id`/`bookId` |
| `400` | `{ "error": "Chapter does not belong to this book" }` | `book_id` doesn't match the chapter's actual book |
| `409` | `{ "error": "This transaction has already been used to unlock different content" }` | Replay attempt for different content — see §3 |

---

## 3. What happens on the backend, step by step

1. **Idempotency / replay check first.** Every `transaction_id` across all
   three endpoints shares one `iap_transactions` table with a
   **database-level unique constraint** on `transaction_id` — not just an
   application check, so two concurrent requests can't both slip through.
   Replaying the exact same (user, content) combination returns success
   again (safe retry); reusing it for different content/user/plan is
   rejected with `409`.
2. **Verify with RevenueCat.**
   - Unlock endpoints: `GET /v1/subscribers/{user_id}`, checks the
     subscriber's `non_subscriptions[product_id]` for an entry whose
     `store_transaction_id` matches, and (in Live mode) that it isn't
     `is_sandbox`. Runs even if the content is already unlocked some other
     way (e.g. an earlier coin purchase) — Apple/Google charged the user
     regardless, so the receipt must be recorded either way.
   - `subscribe-iap`: same subscriber lookup, checks
     `subscriptions[product_id]` instead — `store_transaction_id` matches,
     `expires_date` is in the future, and (in Live mode) not `is_sandbox`.
3. **Unlock / activate.**
   - Unlock endpoints create a `ContentUnlock` row (`unlock_method: "iap"`)
     — the same table and format string (`audiobook_chapter_{trackId}` for
     chapters, `"ebook"`/`"audiobook"` for whole books) the existing
     coin/taka unlock paths use, so the content shows as unlocked
     everywhere else in the app with zero other code changes.
   - `subscribe-iap` creates an active `UserSubscription` with `end_date`
     set from RevenueCat's own `expires_date` (not derived from the plan's
     `duration_days` — the store is the source of truth for when a
     subscription actually expires), plus a `Payment` row for revenue
     reporting.
4. **Contributor earnings (unlock endpoints only).** Calls the same
   `calculateEarnings(...)` the coin/taka unlock paths use, with
   `saleAmount` set to **the book's/chapter's own BDT price from the
   database** (`BookFormat.price` for a whole-book unlock,
   `AudiobookTrack.chapter_taka_price` for a chapter) — not the IAP store
   tier's price, and not `0`. Royalty/earnings payouts for IAP-driven
   unlocks work the same as any other unlock method.

---

## 4. Known limitations

- **No RevenueCat webhook handling.** Verification is pull-based (ask
  RevenueCat at unlock/subscribe time) rather than push-based (RevenueCat
  notifying us). This means there's no automatic refund/chargeback
  handling — if Apple/Google refunds a purchase, the unlock/subscription
  stays active unless handled manually. A subscription also won't
  auto-renew our side's `end_date` past what was captured at activation
  time without either a webhook or the app calling `subscribe-iap` again
  on renewal.
- **`subscribe-iap` doesn't apply a coupon.** Unlike `POST
  /subscriptions/subscribe`, there's no `coupon_code` field — a store
  purchase's price is whatever the app's price tier charged, not something
  this backend can discount after the fact.
