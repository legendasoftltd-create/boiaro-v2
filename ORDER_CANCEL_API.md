# Order Cancellation — Mobile API Reference

One endpoint, `PATCH /orders/:order_id`, cancels an order and reverses everything the original
order granted — RedX parcel, digital access, spent wallet coins, and contributor earnings. This
document is everything a mobile client needs to build a "Cancel Order" flow.

Base URL: `{API_BASE}/api/v1`
Related: `POST /orders` (create), `GET /orders/:order_id` (details) — see `REST_API.md` §10 for
those. This doc only covers cancellation.

---

## 1. Endpoint

### `PATCH /orders/:order_id`

🔒 Auth required (`Authorization: Bearer <accessToken>`). Only the order's own owner can cancel it
— there is no separate admin/support cancel endpoint for mobile to call.

**Request body:**
```json
{
  "status": "cancelled",
  "note": "Changed my mind"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `status` | string | ✅ | Must be exactly `"cancelled"` — this endpoint only cancels, nothing else |
| `note` | string | ❌ | Optional reason, stored on the order's status history for support/admin visibility |

**Success (200):**
```json
{ "success": true }
```

After a successful cancel, re-fetch to reflect the new state (see §4):
- `GET /orders/:order_id` → `status` is now `"cancelled"`
- `GET /library/purchases` → a cancelled digital order's book is gone from the library
- `GET /wallet` → refunded coins (if any were spent) are back in the balance

---

## 2. What cancelling does automatically

No follow-up calls are needed for any of this — one `PATCH` triggers the full reversal:

| Effect | When it applies |
| :--- | :--- |
| Cancels the RedX courier parcel | Order has a `redx_tracking_id` (hardcopy) |
| Revokes digital access (ebook/audiobook disappears from the library) | Order had already granted access (status was `confirmed`, `access_granted`, or `paid`) |
| Refunds spent wallet coins, exact amount | Order was paid with `wallet`/`coins` |
| Reverses contributor earnings | Order had earnings already calculated |
| Sends an in-app + push notification confirming cancellation | Always |

---

## 3. Cancellation policy

Not every order can be self-cancelled at every stage. The server enforces this — the table below
is for deciding **when to show the Cancel button**, not the final word; always handle the 400
error too (see §5), since the client-side check is only a UI hint.

| Order contains | Self-cancel allowed while status is... | Blocked once... |
| :--- | :--- | :--- |
| Hardcopy item | `pending`, `confirmed`, `processing`, `ready_for_pickup` | courier has picked it up: `pickup_received`, `in_transit`, `shipped` |
| Digital item (ebook/audiobook) | the book has never been opened — no reading/listening progress saved for it yet | the user has opened/started it at least once |
| Any order | any non-terminal status | status is already `delivered`, `returned`, `cancelled`, or `refunded` |

- An order mixing hardcopy and digital items must satisfy **both** rules — either one failing
  blocks the whole cancel.
- There is no partial cancel (cancelling one item out of a multi-item order) — cancellation is
  always whole-order.
- Once blocked, there's no "request cancellation" endpoint to build — direct the user to support;
  an admin can still cancel it from the admin panel (e.g. for a dispute).

---

## 4. Suggested client flow

1. `GET /orders/:order_id` (or the order already held in memory from the orders list) → check
   `status` against §3's table to decide whether to render the Cancel button at all.
2. On tap, confirm with the user, then `PATCH /orders/:order_id` with `{ "status": "cancelled" }`.
3. On `200`, show a success state and refresh the three views listed at the end of §1.
4. On `400`, display the returned `error` string directly (see §5) — it's already
   support-appropriate wording, no need to map it to a custom message.

---

## 5. Errors

All errors follow the standard envelope: `{ "error": "..." }`.

**400 — wrong body:**
```json
{ "error": "Only status=cancelled is allowed via this endpoint" }
```

**400 — already in a terminal state:**
```json
{ "error": "Cannot cancel an order with status: delivered" }
```
(`status` in the message will be whichever of `delivered` / `returned` / `cancelled` / `refunded`
the order is actually in.)

**400 — hardcopy already shipped:**
```json
{ "error": "This order has already shipped and can no longer be self-cancelled. Please contact support." }
```

**400 — ebook already opened:**
```json
{ "error": "You've already started reading this book, so it can no longer be self-cancelled. Please contact support." }
```

**400 — audiobook already opened:**
```json
{ "error": "You've already started listening to this audiobook, so it can no longer be self-cancelled. Please contact support." }
```

**404 — not your order / doesn't exist:**
```json
{ "error": "Order not found" }
```

---

## 6. Example — end to end

```
GET /api/v1/orders/9f2e1c4a-...
→ { "status": "confirmed", "order_items": [{ "format": "ebook", ... }], ... }
→ status is cancellable per §3, and no reading progress exists yet → show Cancel button

PATCH /api/v1/orders/9f2e1c4a-...
Body: { "status": "cancelled" }
→ 200 { "success": true }

GET /api/v1/library/purchases
→ the ebook is no longer in the list

GET /api/v1/wallet
→ balance unchanged (this order was paid online, not with coins)
```

---

## 7. Idempotency notes for client implementers

- Calling `PATCH` twice on the same order is safe: the second call returns the 400 "already
  cancelled" error and makes no further changes (no double refund, no double notification).
- If a request times out client-side but actually succeeded server-side, a retry will simply hit
  the "already cancelled" 400 — treat that specific message as a success case in retry logic.
