# RevenueCat (Apple IAP) — Backend Integration

Implements the flow described in the original integration request: Apple IAP payment happens client-side (Apple's purchase sheet), then the Flutter app sends the resulting transaction to this one new endpoint, which verifies it with RevenueCat and unlocks the chapter server-side.

---

## 1. Required setup before this works

### RevenueCat must be configured with `appUserID = our internal user id`

This backend verifies a purchase by asking RevenueCat: *"what has this app_user_id bought?"* — using **our own `user_id`** (the same id in the JWT this API already issues) as the lookup key. That only works if the Flutter app initializes RevenueCat like this, right after our own login:

```dart
await Purchases.logIn(ourUserId); // ourUserId = the same id used for Authorization: Bearer <token>
```

If RevenueCat is left on its own anonymous ID instead, verification will always fail (RevenueCat won't have any purchase history under our `user_id`). This is RevenueCat's documented ["Identifying Users"](https://docs.revenuecat.com/docs/user-ids) pattern — not something invented for this integration.

### Admin panel — Payment Gateways → RevenueCat (Apple IAP)

A new gateway row appears automatically (self-seeding, no migration/seed script needed). Open it and:
1. Paste the **Secret API Key** from the RevenueCat dashboard (Project Settings → API Keys → **secret** key, not the public SDK key).
2. Toggle it **Enabled**.

Until both are set, every `unlock-iap` call returns `402 { "error": "RevenueCat is not configured" }`.

---

## 2. Endpoint

### `POST /api/v1/chapters/:trackId/unlock-iap`

**Auth:** `Authorization: Bearer <access_token>` (the same user whose id was passed to `Purchases.logIn`)

Request body:
```json
{
  "book_id": "uuid",
  "transaction_id": "2000000123456789",
  "product_id": "tier_1_99"
}
```
- `book_id` — the book this chapter belongs to (matches the existing `/initiate-payment` and `/unlock-coin` convention).
- `transaction_id` — Apple's transaction id for the completed purchase (what RevenueCat's SDK returns as `customerInfo.nonSubscriptionTransactions.last.transactionIdentifier`, or the `storeTransaction.transactionId`).
- `product_id` — optional but **recommended**. Without it, verification searches every consumable product RevenueCat has on file for that user instead of just the one purchased — slightly slower and very slightly less precise. Always send it when available.

Success response (`200`):
```json
{
  "success": true,
  "already_unlocked": false,
  "track_id": "uuid",
  "book_id": "uuid",
  "message": "Book unlocked successfully"
}
```

Error responses:
| Status | Body | Meaning |
| :--- | :--- | :--- |
| `402` | `{ "error": "RevenueCat is not configured" }` | Admin hasn't set up the gateway yet |
| `402` | `{ "error": "No matching purchase found for this transaction" }` | RevenueCat has no record of this transaction for this user — verification failed |
| `404` | `{ "error": "Chapter not found" }` | Bad `track_id` |
| `400` | `{ "error": "Chapter does not belong to this book" }` | `book_id` doesn't match the chapter's actual book |
| `409` | `{ "error": "This transaction has already been used to unlock different content" }` | Replay attempt — see §3 |

### `POST /api/v1/books/:bookId/unlock-iap`

Same flow as above, but unlocks the whole eBook or Audiobook (not a single chapter). `book_id` comes from the URL path instead of the request body.

**Auth:** `Authorization: Bearer <access_token>`

Request body:
```json
{
  "transaction_id": "2000000123456789",
  "product_id": "tier_1_99",
  "format": "ebook"
}
```
- `transaction_id` — Apple's transaction id for the completed purchase.
- `product_id` — optional but recommended, same as above.
- `format` — `"ebook"` or `"audiobook"`. A `bookId` can have both formats, each unlocked independently.

Success response (`200`):
```json
{
  "success": true,
  "already_unlocked": false,
  "book_id": "uuid",
  "message": "Full book unlocked successfully"
}
```

Error responses: same shape as the chapter endpoint (`402` not configured / not verified, `404` book not found, `400` validation error on `format`, `409` replay for different content). The `ContentUnlock` row uses `format: "ebook"` / `format: "audiobook"` directly (no chapter suffix) and `iap_transactions.track_id` is `null`, so it doesn't collide with per-chapter unlocks of the same book.

---

## 3. What happens on the backend, step by step

1. **Idempotency / replay check first.** Every `transaction_id` is stored in a new `iap_transactions` table with a **database-level unique constraint** — not just an application check — so two concurrent requests can't both slip through. If this exact transaction was already recorded for the *same* user + book + chapter, the endpoint returns success again (safe to retry after a network timeout). If it was recorded for a *different* book/chapter/user, it's rejected with `409` — this is the anti-fraud check from the original spec ("same payment can't unlock multiple books").
2. **Verify with RevenueCat.** Calls `GET https://api.revenuecat.com/v1/subscribers/{user_id}` with the gateway's secret key, and checks the subscriber's `non_subscriptions` list for an entry whose `id` or `store_transaction_id` matches the submitted `transaction_id`. This still runs even if the chapter is already unlocked some other way (e.g. earlier coin purchase) — Apple has charged the user regardless, so the receipt must be recorded either way.
3. **Unlock.** On a verified match, creates a `ContentUnlock` row (`unlock_method: "iap"`) — the exact same table and format string (`audiobook_chapter_{trackId}`) used by the existing coin/taka unlock paths, so this chapter now shows as unlocked everywhere else in the app (book detail, chapter list, playback) with zero other code changes needed.
4. **Contributor earnings.** Calls the same `calculateEarnings(...)` used by the coin-unlock path, with `saleAmount: 0` — matching the existing coin-unlock behavior exactly (which also passes `0` and is therefore a no-op today). Apple IAP price tiers aren't taka/coin amounts, so there's no automatic conversion; see §4.

---

## 4. Known limitations (flagging, not silently building further)

- **No automatic revenue-split entry for IAP sales.** Same as the existing coin-unlock path, `calculateEarnings` is called with `saleAmount: 0`, so no `ContributorEarning` row is created for either flow today. If accurate contributor payouts for IAP sales are needed, the price tier → BDT/USD amount mapping needs to be decided first (e.g. passing the tier's known USD price in the request body) — out of scope here since it wasn't specified.
- **No RevenueCat webhook handling.** Verification is pull-based (ask RevenueCat at unlock time) rather than push-based (RevenueCat notifying us). This matches the flow described in the original request and avoids needing a public webhook endpoint, but means there's no automatic refund/chargeback handling — if Apple refunds a purchase, the unlock stays active unless handled manually.
- **Whole-book IAP purchases** are now covered by `POST /api/v1/books/:bookId/unlock-iap` (§2) — same verification/idempotency logic, scoped to the whole eBook/Audiobook format instead of one chapter.
