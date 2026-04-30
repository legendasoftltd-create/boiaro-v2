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
