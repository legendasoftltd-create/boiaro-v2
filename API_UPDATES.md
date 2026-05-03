# API Updates Documentation

This document summarizes the API work completed in this update cycle, including new endpoints, behavior changes, and documentation updates.

## 1) Homepage REST API

### Updated endpoint

- `GET /api/v1/homepage`

### New endpoint

- `GET /api/v1/homepage/:section`

### What changed

- Added section-wise homepage API so clients can fetch one block at a time.
- Added support for query `limit` with default value `10` (capped at `50`).
- Added support for query `type` on homepage APIs.
  - Supported values: `ebook`, `audiobook`, `hardcopy`
  - Accepted alias: `hardcover` (normalized to hardcopy matching)
- Added validation for invalid `type` values:
  - Returns `400` with: `Invalid type. Allowed values: ebook, audiobook, hardcopy`
- Applied `limit` consistently to homepage lists.
- Applied `type` filtering to book-based homepage sections.

### Supported homepage section keys

- `slider`
- `trendingNow`
- `popularBooks`
- `becauseYouRead`
- `editorsPick`
- `appDownload`
- `popularAudiobooks`
- `popularHardCopies`
- `popularEbooks`
- `topMostRead`
- `allCategory`
- `allAuthor`
- `allNarrators`
- `countsValue`
- `newReleases`
- `freeBooks`
- `continueReading`
- `continueListening`
- `radio`
- `currentUser`

## 2) Payments (SSLCommerz) REST API

### Updated endpoint

- `POST /api/v1/payments/initiate`

### Existing callback/IPN endpoints (kept active)

- `ALL /api/v1/payments/sslcommerz/success`
- `ALL /api/v1/payments/sslcommerz/fail`
- `ALL /api/v1/payments/sslcommerz/cancel`
- `POST /api/v1/payments/sslcommerz/ipn`

### What changed

- Replaced stub payment initiation logic with real SSLCommerz initialization.
- Added gateway enable/config checks from DB/environment.
- Added sandbox/live initialization URL handling based on gateway mode.
- Added creation/update of payment record with generated transaction ID.
- Added payment event logging for initiation.
- Updated order state to `awaiting_payment` during initiation.
- Initiate response now returns real data:
  - `success`
  - `gateway_url`
  - `transaction_id`
  - `raw_status`

## 3) tRPC Payment Flow Status

### Checked and confirmed

- SSLCommerz flow already existed in tRPC:
  - `orders.placeOrder` with `paymentMethod = "sslcommerz"`
- Result: both integration styles are supported now:
  - REST + tRPC

## 4) Books REST API

### Updated endpoint

- `GET /api/v1/books`

### What changed

- Added narrator object support inside each format in list response.
- Narrator data is now available per format as:
  - `formats[].narrators` (object or `null`)
- Kept existing book-level author and publisher objects intact.
- Added query param filtering aliases for creator-based filtering:
  - `author` -> filters by `author_id`
  - `publisher` -> filters by `publisher_id`
- Added narrator-based filtering:
  - `narrator` -> returns books that have at least one approved and available format with matching `narrator_id`
- Backward compatibility kept for existing params:
  - `authorId` and `publisherId` continue to work

### Examples

- `GET /api/v1/books?author=<authorId>`
- `GET /api/v1/books?publisher=<publisherId>`
- `GET /api/v1/books?narrator=<narratorId>`
- `GET /api/v1/books?author=<authorId>&publisher=<publisherId>&narrator=<narratorId>`

### Why narrator is under formats

- Narrator is format-specific (primarily audiobook), so it belongs to format entries rather than top-level book object.

## 5) Followed Status in REST APIs

### Scope

- REST only (`/api/v1/*`)
- No changes were made to tRPC/web procedures for this update

### Updated endpoints

- `GET /api/v1/authors`
- `GET /api/v1/publishers`
- `GET /api/v1/narrators`
- `GET /api/v1/books/:id`
- `GET /api/v1/books/slug/:slug`
- `POST /api/v1/authors/:id/follow`
- `POST /api/v1/authors/:id/unfollow`
- `POST /api/v1/publishers/:id/follow`
- `POST /api/v1/publishers/:id/unfollow`
- `POST /api/v1/narrators/:id/follow`
- `POST /api/v1/narrators/:id/unfollow`

### What changed

- Added follow-state enrichment using authenticated REST user context (`Authorization` header).
- List APIs now include:
  - `authors[].followed`
  - `publishers[].followed`
  - `narrators[].followed`
- Book details APIs now include:
  - `author.followed`
  - `publisher.followed`
  - `formats[].narrator.followed` (when narrator exists)
- Follow lookup is based on `follows` relation with:
  - `follower_id = current user`
  - `followee_id = author/publisher/narrator id`
- Added explicit REST follow mutation endpoints (instead of only toggle) for creator profiles.
  - Follow endpoint response: `{ following: true, count }`
  - Unfollow endpoint response: `{ following: false, count }`

### Response behavior notes

- If request is authenticated:
  - `followed` reflects actual follow state for current user.
- If request is unauthenticated:
  - `followed` is returned as `false`.

## 6) Social Login REST APIs

### New endpoints

- `POST /api/v1/auth/social/google`
- `POST /api/v1/auth/social/facebook`

### Alias endpoints (backward-friendly)

- `POST /api/v1/auth/google`
- `POST /api/v1/auth/facebook`

### What changed

- Added REST social login parity with existing tRPC auth social flow.
- Added Google access-token validation and audience check against `GOOGLE_CLIENT_ID`.
- Added Facebook token verification using app credentials:
  - `FACEBOOK_APP_ID`
  - `FACEBOOK_APP_SECRET`
- Added social profile fetch and account lookup by email.
- Added automatic user creation for first-time social users with:
  - random generated password hash
  - default `user` role
  - generated `referral_code`
  - `email_verified = true`
- Added deleted/deactivated account blocking during social sign-in.
- Added JWT issuance in REST response:
  - `access_token`
  - `refresh_token`
  - `expires_in`
  - `user_id`
  - `user` (id, email, roles, profile)

### Request behavior

- Accepts either:
  - `access_token`
  - `accessToken`

## 7) Profile REST API

### Updated endpoint

- `PATCH /api/v1/profile`

### New endpoint

- `POST /api/v1/profile/upload-image`

### What changed

- Expanded profile update payload support to include additional creator/contact fields:
  - `genre`
  - `specialty`
  - `experience`
  - `phone`
  - `website_url`
  - `facebook_url`
  - `instagram_url`
  - `youtube_url`
  - `portfolio_url`
- Existing profile update fields remain supported:
  - `display_name`
  - `full_name`
  - `avatar_url`
  - `bio`
  - `preferred_language`
- Added authenticated profile image upload endpoint with multipart form-data support.
- Upload API accepts image file in field:
  - `image` (preferred)
  - `file` (fallback alias)
- On success, uploaded image URL is saved to profile `avatar_url` and returned in response.

### Example upload request

- `POST /api/v1/profile/upload-image`
- Content type: `multipart/form-data`
- Form-data field: `image` (file)

## 8) Shipping REST API

### New endpoint

- `GET /api/v1/shipping/methods`
- `GET /api/v1/shipping/districts`

### What changed

- Added REST parity for tRPC `shipping.methods`.
- Endpoint returns active shipping methods ordered by `base_cost` ascending.
- Supports optional query param `districtId` for request-shape compatibility.
- Added districts endpoint for shipping/address dependency handling.
- Districts response includes `is_dhaka_area` to support area-specific shipping behavior.

### How to use district API

- Request:
  - `GET /api/v1/shipping/districts`

- Example response:

```json
{
  "districts": [
    { "name": "Dhaka", "is_dhaka_area": true },
    { "name": "Chattogram", "is_dhaka_area": false }
  ]
}
```

- Frontend usage flow:
  - Load district list on checkout page load.
  - Bind `districts[].name` into district dropdown options.
  - Use selected district's `is_dhaka_area` to show delivery badge/zone logic.
  - Optionally send selected district as `districtId` query to `GET /api/v1/shipping/methods`.

## 9) Bookmarks & Reviews REST API

### Updated endpoints

- `POST /api/v1/books/:id/reviews`
- `GET /api/v1/books/:id/bookmark`
- `POST /api/v1/books/:id/bookmark`

### New endpoints

- `GET /api/v1/books/:id/bookmarks`
- `POST /api/v1/books/:id/bookmarks`
- `DELETE /api/v1/books/:id/bookmarks`

### What changed

- Added book existence validation before review submission:
  - `POST /api/v1/books/:id/reviews` now verifies the target book exists and is `approved`.
  - If book does not exist (or is not approved), returns not found.
- Added book existence validation before bookmark operations:
  - `GET /api/v1/books/:id/bookmark`
  - `POST /api/v1/books/:id/bookmark`
  - If book does not exist (or is not approved), returns not found.
- Added explicit non-toggle bookmark endpoints for clients that prefer deterministic add/remove behavior:
  - `POST /api/v1/books/:id/bookmarks` always ensures bookmarked state.
  - `DELETE /api/v1/books/:id/bookmarks` always ensures unbookmarked state.
  - `GET /api/v1/books/:id/bookmarks` returns current state.
- Kept backward compatibility:
  - Existing toggle endpoint `POST /api/v1/books/:id/bookmark` remains active.
  - Existing status endpoint `GET /api/v1/books/:id/bookmark` remains active.

### Response behavior

- Bookmark status endpoints return:
  - `{ "bookmarked": true }` or `{ "bookmarked": false }`
- Review submit endpoint behavior remains upsert-style:
  - existing review by same user is updated and set to `pending`
  - no existing review creates a new review with `pending` status

## 10) Orders REST API

> **Prior state:** `POST /api/v1/orders` and `GET /api/v1/orders/:order_id` already existed as basic stubs. `GET /api/v1/orders` (list) and `GET /api/v1/orders/payment-gateways` did not exist.

### New endpoints

- `GET /api/v1/orders` — paginated order list
- `GET /api/v1/orders/payment-gateways` — available payment gateways (mirrors tRPC `orders.paymentGateways`)

### Updated endpoints

- `POST /api/v1/orders` — rewritten to fully mirror tRPC `orders.placeOrder`
- `GET /api/v1/orders/:order_id` — now returns full order with `items → book`, `payments`, `status_history`

### What changed — GET /api/v1/orders/payment-gateways

- Returns all enabled payment gateways ordered by `sort_priority`.
- No authentication required.
- Direct mirror of tRPC `orders.paymentGateways`.

### What changed — GET /api/v1/orders

- Paginated order list for authenticated users.
- Supports query params:
  - `limit` (default `20`, max `100`)
  - `cursor` (order ID for cursor-based pagination)
- Returns raw Prisma response with same includes as tRPC `orders.myOrders`:
  - `items → book_format → book (id, title, cover_url)`
  - `payments` (full payment records)

```json
{
  "orders": [...],
  "nextCursor": "string | undefined"
}
```

### What changed — POST /api/v1/orders

Full port of tRPC `orders.placeOrder` logic into REST. Behaviour is identical.

- **Stock validation** for hardcopy items — returns `400` if out of stock.
- **Duplicate-purchase guard** for digital items — returns `400` if already purchased or coin-unlocked.
- **`book_format_id` resolved from DB** — looked up per `book_id + format`, same as tRPC.
- **Item `price` and `grand_total` trusted from client** — same as tRPC (client sends pre-calculated values).
  - If `grand_total` is omitted, server calculates from items + shipping − coupon discount.
- **Payment methods supported**: `cod`, `demo`, `bkash`, `nagad`, `sslcommerz`, `wallet` / `coins`.
- **SSLCommerz** — full gateway initiation: reads config from DB/env, posts to sandbox/live URL, logs `PaymentEvent`, returns `{ orderId, gatewayUrl }`.
- **Wallet / coins payment** (extension on top of tRPC):
  - Requires `coin_amount` in request body.
  - Validates sufficient coin balance before order creation.
  - Deducts coins and logs `CoinTransaction` with `source: "order_payment"`.
- **Digital fulfilment** (for `demo`, `bkash`, `nagad`, `wallet`):
  - Creates `UserPurchase` record per digital item.
  - Upserts `ContentUnlock` for immediate access.
  - Calculates and records contributor earnings via `calculateEarnings`.
  - Sets order status to `confirmed`.
- **Coupon usage recorded** — creates `CouponUsage` row and increments `coupon.used_count` when `applied_coupon_id` + `coupon_discount` are provided.
- **Response shape** — same as tRPC: `{ orderId, gatewayUrl }`.
  - `gatewayUrl` is a string for SSLCommerz, `null` for all other methods.

### What changed — GET /api/v1/orders/:order_id

- Now returns full Prisma object matching tRPC `orders.byId`:
  - `items → book_format → book` (full book record)
  - `payments` (full records)
  - `status_history` (ordered desc by `created_at`)

### Request body — POST /api/v1/orders

```json
{
  "items": [
    {
      "book_id": "string",
      "format": "ebook | audiobook | hardcopy",
      "quantity": 1,
      "price": 150,
      "book_title": "string (optional, used in error messages)"
    }
  ],
  "payment_method": "cod | demo | bkash | nagad | sslcommerz | wallet | coins",
  "grand_total": 210,
  "coupon_code": "SAVE10",
  "coupon_discount": 20,
  "applied_coupon_id": "string (optional)",
  "coin_amount": 500,
  "shipping_name": "string",
  "shipping_phone": "string",
  "shipping_address": "string",
  "shipping_city": "string",
  "shipping_district": "string",
  "shipping_area": "string",
  "shipping_zip": "string",
  "shipping_method_id": "string",
  "shipping_method_name": "string",
  "shipping_carrier": "string",
  "shipping_cost": 60,
  "estimated_delivery_days": "3-5",
  "total_weight": 0.5,
  "packaging_cost": 20
}
```

### Response — POST /api/v1/orders

```json
{
  "orderId": "string",
  "gatewayUrl": "https://sandbox.sslcommerz.com/... | null"
}
```

## 11) Subscriptions REST API

### New endpoints

- `GET /api/v1/subscriptions/active`
- `POST /api/v1/subscriptions/subscribe`

### What changed — GET /api/v1/subscriptions/active

- Returns the authenticated user's current active subscription (or `null`).
- Includes plan details: `name`, `description`, `features`, `duration_days`.

### What changed — POST /api/v1/subscriptions/subscribe

- Creates a new subscription for the authenticated user.
- Validates the plan is active.
- Supports optional coupon: if `coupon_code` is provided, validates and applies discount automatically.
- Calculates `end_date` as `start_date + plan.duration_days`.
- Records coupon usage in `CouponUsage` and increments `used_count`.
- Returns the created subscription with plan details.

### Request body — POST /api/v1/subscriptions/subscribe

```json
{
  "plan_id": "string",
  "coupon_code": "string (optional)",
  "coupon_discount": 10,
  "payment_method": "demo | sslcommerz | bkash | nagad (default: demo)"
}
```

### Updated — GET /api/v1/subscriptions/plans and /my

- `/plans` response now includes `is_featured` and `sort_order` fields.
- `/my` response now includes `amount_paid`, `coupon_code`, `discount_amount`, and full plan `description` and `features`.

## 12) Wallet REST API

### New endpoint

- `GET /api/v1/wallet/coin-settings`

### What changed

- Returns coin system configuration from `PlatformSetting` table.
- No authentication required.
- Response shape:

```json
{
  "system_enabled": true,
  "unlock_enabled": true,
  "conversion_ratio": 0.10,
  "ads_per_quick_unlock": 5,
  "bonus_per_session": 5,
  "coin_ad_reward": 1,
  "daily_limit": 10,
  "ad_cooldown_minutes": 5
}
```

- `conversion_ratio` indicates the BDT value of 1 coin (e.g. `0.10` = 10 coins per ৳1).
- Use this on the client to calculate how many coins are needed to pay for an order before submitting `payment_method: "wallet"`.

## 13) Coupons REST API

### New router — `/api/v1/coupons`

#### New endpoints

- `GET /api/v1/coupons/:code`
- `POST /api/v1/coupons/validate`

### GET /api/v1/coupons/:code

- Public endpoint, no auth required.
- Looks up a coupon by code (case-insensitive).
- Returns `404` if not found or inactive.
- Returns `400` if expired or usage limit reached.
- Returns basic coupon info on success: `id`, `code`, `discount_type`, `discount_value`, `applies_to`, `description`, `min_order_amount`, `first_order_only`, `end_date`.

### POST /api/v1/coupons/validate

- Requires authentication.
- Full coupon validation against order details.
- Returns `discount_amount` and `final_amount` ready to use in order submission.

### Request body — POST /api/v1/coupons/validate

```json
{
  "code": "SAVE10",
  "total_amount": 500,
  "has_hardcopy": false,
  "has_ebook": true,
  "has_audiobook": false
}
```

### Response — POST /api/v1/coupons/validate

```json
{
  "valid": true,
  "coupon_id": "string",
  "code": "SAVE10",
  "discount_type": "percentage | fixed",
  "discount_value": 10,
  "discount_amount": 50,
  "final_amount": 450
}
```

### Validation rules applied

- Coupon must be `active`.
- Must be within `start_date` / `end_date` window.
- Must not exceed global `usage_limit`.
- Must meet `min_order_amount` threshold.
- `applies_to` must match order content types (`hardcopy`, `ebook`, `audiobook`, `all`).
- `per_user_limit` checked per authenticated user.
- `first_order_only` checked against confirmed order history.

## 14) Wishlist (Bookmarks) REST API

### New endpoint

- `GET /api/v1/me/wishlist`

### What changed

- Added a dedicated wishlist endpoint as a structured alias for `/api/v1/me/bookmarks`.
- Returns user's bookmarked books in a `{ wishlist, total }` envelope.
- Each entry includes: `id`, `book_id`, `added_at`, and a full `book` object (with author and approved formats).

### Response shape

```json
{
  "wishlist": [
    {
      "id": "string",
      "book_id": "string",
      "added_at": "2025-01-01T00:00:00.000Z",
      "book": {
        "id": "string",
        "title": "string",
        "cover_url": "string",
        "author": { "id": "string", "name": "string" },
        "formats": [ { "id": "string", "format": "ebook", "price": 100 } ]
      }
    }
  ],
  "total": 3
}
```

## 15) Access Check REST API

### Updated endpoint

- `POST /api/v1/access/check`

### What changed

- `has_unlock` is now computed correctly — was always `false` before.
  - Now checks `ContentUnlock` table for an active coin-based unlock for the user + book + format.
- Added preview fields to response for `ebook` and `audiobook` formats:
  - `preview_available` — `true` if preview percentage or chapters are set, or book is free.
  - `preview_percentage` — percentage of content unlocked as preview (from `BookFormat`).
  - `preview_chapters` — number of chapters unlocked as preview (from `BookFormat`).
- `format` in request body now used to scope purchase and unlock checks per-format.
- Access check now runs purchase, subscription, and coin-unlock queries in parallel for performance.
- **Bug fixed** — subscription check now correctly handles lifetime subscriptions (`end_date: null`).
  - Was: `end_date: { gt: now }` — missed subscriptions with no expiry.
  - Now: `OR: [{ end_date: null }, { end_date: { gte: now } }]` — matches tRPC `wallet.checkAccess` exactly.

### Updated response shape

```json
{
  "has_access": true,
  "access_method": "coin | purchase | subscription | free | none",
  "is_free": false,
  "has_subscription": false,
  "has_purchase": false,
  "has_unlock": true,
  "preview_available": true,
  "preview_percentage": 20,
  "preview_chapters": 2
}
```

## 16) Homepage Service — Server Error Fix

### What changed

- User-specific homepage queries (reading progress, listening progress) are now wrapped in individual `try/catch` blocks.
- Radio station and live session queries are also wrapped in `try/catch`.
- Any failure in user-specific data no longer crashes the homepage response — the main homepage content is always returned even if personalization data fails.
- Errors are logged to server console for debugging without surfacing to clients.

## 17) RedX Delivery Integration

### Overview

Full integration with the [RedX OpenAPI](https://redx.com.bd/developer-api/) for parcel creation, tracking, and status sync. Covers both REST (mobile) and tRPC (web). Parcels are created automatically when a hardcopy order is placed. Status updates are received in real time via webhook.

---

### New endpoints — Shipping / RedX

#### GET /api/v1/shipping/redx/areas

Returns delivery areas from RedX. Filter by district to get a manageable list for the checkout area picker.

**Query params**

| Param | Type | Description |
|---|---|---|
| `district_name` | string | Filter by district (uses RedX spelling — see mapping below) |
| `post_code` | string | Filter by postal code |

**Note:** RedX uses legacy spellings for some districts. The mapping is handled automatically on the web. For REST clients, use the RedX name directly:

| Our district name | RedX `district_name` |
|---|---|
| Chattogram | Chittagong |
| Barishal | Barisal |
| Narsingdi | Norshingdi |
| Lakshmipur | Laksmipur |
| Coxs Bazar | Cox's Bazar |
| Khagrachhari | Khagrachari |
| Chapainawabganj | Chapai Nawabganj |
| Jhalokati | Jhalokathi |
| Pirojpur | Perojpur |

**Response**

```json
{
  "areas": [
    {
      "id": 12,
      "name": "Dhanmondi",
      "post_code": 1209,
      "district_name": "Dhaka",
      "division_name": "Dhaka",
      "zone_id": 1
    }
  ]
}
```

Returns `{ "areas": [] }` (not an error) when no areas match — handle gracefully on client.

---

#### GET /api/v1/shipping/redx/track/:parcel_id

Returns tracking events for a RedX parcel ID. For tracking by order ID from a user context use `GET /api/v1/orders/:order_id/tracking` instead.

**Response**

```json
{
  "tracking": [
    {
      "message_en": "Package is created successfully",
      "message_bn": "পার্সেলটি সফলভাবে প্লেস করা হয়েছে",
      "time": "2025-01-04T21:19:41.000Z"
    }
  ]
}
```

---

#### GET /api/v1/shipping/redx/parcel/:tracking_id

Returns full parcel details from RedX.

---

#### POST /api/v1/shipping/redx/parcel

Manually create a RedX parcel. For normal checkout flow this is handled automatically — use this endpoint for custom/admin parcel creation.

**Request body**

```json
{
  "customer_name": "string",
  "customer_phone": "string",
  "delivery_area": "string",
  "delivery_area_id": 12,
  "customer_address": "string",
  "cash_collection_amount": "500",
  "parcel_weight": "500",
  "value": "500",
  "merchant_invoice_id": "string (optional)",
  "instruction": "string (optional)",
  "pickup_store_id": 1420
}
```

**Response**

```json
{ "tracking_id": "string" }
```

---

#### POST /api/v1/shipping/redx/parcel/:tracking_id/cancel

Cancel a RedX parcel.

**Request body**

```json
{ "reason": "string (optional)" }
```

---

#### GET /api/v1/shipping/redx/charge

Queries RedX's charge calculator directly. **This is not used at checkout.** Shipping charges shown to customers are sourced from the DB shipping methods table (`GET /api/v1/shipping/methods`) which are managed independently of RedX rates. Use this endpoint for internal cost reconciliation or admin tooling only.

**Query params**

| Param | Type | Required |
|---|---|---|
| `delivery_area_id` | number | Yes |
| `pickup_area_id` | number | Yes |
| `cash_collection_amount` | number | Yes |
| `weight` | number (grams) | Yes |

**Response**

```json
{
  "deliveryCharge": 60,
  "codCharge": 0
}
```

---

#### GET /api/v1/shipping/redx/pickup-stores

List all RedX pickup stores configured for the merchant.

---

#### GET /api/v1/shipping/redx/pickup-stores/:id

Get details of a single pickup store.

---

#### POST /api/v1/shipping/redx/pickup-stores

Create a new RedX pickup store.

**Request body**

```json
{
  "name": "string",
  "phone": "string",
  "address": "string",
  "area_id": 284
}
```

---

#### POST /api/v1/shipping/redx/webhook

Receives real-time parcel status updates from RedX. **This endpoint is for RedX only — do not call it from client apps.**

Register in the RedX dashboard as:
```
https://yourdomain.com/api/v1/shipping/redx/webhook?token=<REDX_WEBHOOK_SECRET>
```

The `token` query param must match `REDX_WEBHOOK_SECRET` in `.env`. Requests without a valid token return `401`.

**RedX status → order status mapping**

| RedX status | Order status |
|---|---|
| `ready-for-delivery` | `pickup_received` |
| `delivery-in-progress` | `in_transit` |
| `delivered` | `delivered` |
| `agent-hold` | `in_transit` |
| `agent-returning` | `returned` |
| `returned` | `returned` |
| `agent-area-change` | `in_transit` |

Each status change also creates an `OrderStatusHistory` record. Always responds `200` to prevent RedX retries.

---

### Shipping charge — how it works

Delivery charges shown to customers at checkout come from the **DB shipping methods table**, not from the RedX charge calculator. Use `GET /api/v1/shipping/methods` to fetch available methods and calculate cost client-side:

```
charge = base_cost + max(0, ceil(total_weight_kg - 0.5)) × per_kg_cost
```

Methods are zone-aware — filter by `zone` field (`inside_dhaka`, `outside_dhaka`, or `all`) based on the customer's selected district. Use `GET /api/v1/shipping/districts` to determine `is_dhaka_area` for a given district.

The `GET /api/v1/shipping/redx/charge` endpoint reflects what RedX actually bills internally and is intended for admin/reconciliation use only — it is not part of the customer-facing checkout flow.

---

### Updated endpoints — Orders

#### POST /api/v1/orders

**New field in request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `shipping_area_id` | number | Required for hardcopy orders | RedX area `id` from `GET /api/v1/shipping/redx/areas` |

When `shipping_area_id` is present and the order contains hardcopy items, a RedX parcel is created automatically after the order is saved. The returned `tracking_id` is stored on the order as `redx_tracking_id`. Parcel creation failure does **not** fail the order — it is logged and the order proceeds normally.

**Updated request body**

```json
{
  "items": [...],
  "payment_method": "cod",
  "grand_total": 560,
  "shipping_name": "Akram Hossain",
  "shipping_phone": "01XXXXXXXXX",
  "shipping_address": "46/1 Hemendra Dash Road",
  "shipping_district": "Dhaka",
  "shipping_area": "Dhanmondi",
  "shipping_area_id": 2,
  "shipping_cost": 60,
  "total_weight": 0.5
}
```

---

#### GET /api/v1/orders/:order_id/tracking *(new)*

Returns live RedX tracking events for the authenticated user's order. The user does not need to know the RedX tracking ID — it is resolved from the order.

**Auth:** Required

**Response**

```json
{
  "tracking": [
    {
      "message_en": "Package is created successfully",
      "message_bn": "পার্সেলটি সফলভাবে প্লেস করা হয়েছে",
      "time": "2025-01-04T21:19:41.000Z"
    }
  ]
}
```

Returns `404` if the order has no RedX tracking ID yet.

---

#### PATCH /api/v1/orders/:order_id *(new)*

Allows a user to cancel their own order. Also cancels the associated RedX parcel if one exists.

**Auth:** Required

**Request body**

```json
{
  "status": "cancelled",
  "note": "string (optional)"
}
```

Only `status: "cancelled"` is accepted. Returns `400` if the order is already `delivered`, `returned`, or `cancelled`.

**Response**

```json
{ "success": true }
```

---

### Order status flow (hardcopy)

```
pending → confirmed → processing → ready_for_pickup → pickup_received → in_transit → delivered
```

| Status | Triggered by |
|---|---|
| `pending` | Auto on order placement |
| `confirmed` | Auto on payment success |
| `processing` | Admin manually (packing) |
| `ready_for_pickup` | Admin manually (ready for RedX pickup) |
| `pickup_received` | RedX webhook (`ready-for-delivery`) |
| `in_transit` | RedX webhook (`delivery-in-progress`) |
| `delivered` | RedX webhook (`delivered`) |
| `returned` | RedX webhook (`returned` / `agent-returning`) |

---

### Environment variables

| Variable | Description |
|---|---|
| `REDX_ENV` | `development` uses sandbox, anything else uses production |
| `REDX_BASE_URL` | Production base URL (`https://openapi.redx.com.bd/v1.0.0-beta`) |
| `REDX_API_TOKEN` | Production JWT token |
| `REDX_SANDBOX_TOKEN` | Sandbox JWT token (used when `REDX_ENV=development`) |
| `REDX_PICKUP_STORE_ID` | Your RedX pickup store ID (get from `GET /api/v1/shipping/redx/pickup-stores`) |
| `REDX_WEBHOOK_SECRET` | Secret token validated on incoming webhook requests |


