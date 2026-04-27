# Web App API Documentation

## Overview

This API uses **tRPC v11** over HTTP. All requests are `POST` to a batch endpoint.

### Base URL

```
Production:  http://staging.boiaro.com/trpc
Development: http://localhost:3001/trpc
```

Configure via the `VITE_API_URL` environment variable for production deployments.

### Request Format

All calls go to a single batch endpoint:

```
POST /trpc/{router}.{procedure}?batch=1
Content-Type: application/json
Authorization: Bearer <access_token>   (for protected endpoints)

{"0": <input_object>}
```

**Queries** (read operations) can also use `GET`:
```
GET /trpc/{router}.{procedure}?batch=1&input={"0":<json_encoded_input>}
```

### Response Format

```json
[
  {
    "result": {
      "data": { ... }
    }
  }
]
```

Always read `response[0].result.data`.

### Error Format

```json
[
  {
    "error": {
      "json": {
        "message": "Error description",
        "code": -32600,
        "data": {
          "code": "UNAUTHORIZED",
          "httpStatus": 401
        }
      }
    }
  }
]
```

### Error Codes

| tRPC Code       | HTTP Status | Description                          |
|-----------------|-------------|--------------------------------------|
| `UNAUTHORIZED`  | 401         | Missing or invalid token             |
| `FORBIDDEN`     | 403         | Account deactivated / deleted        |
| `NOT_FOUND`     | 404         | Resource does not exist              |
| `CONFLICT`      | 409         | Duplicate resource (e.g. email)      |
| `BAD_REQUEST`   | 400         | Validation failure / business rule   |

---

## Authentication

### Token Storage

| Key             | Value           | Expiry  |
|-----------------|-----------------|---------|
| `access_token`  | JWT access token  | 15 min  |
| `refresh_token` | JWT refresh token | 30 days |

Store both tokens securely (Keychain on iOS, Keystore on Android). Send the access token in every protected request header:

```
Authorization: Bearer <access_token>
```

When you receive a `401`, call `auth.refresh` with the refresh token to get new tokens. Retry the original request once.

---

## Router: `auth`

### `auth.signUp` — Register a new user

**Auth required:** No

**Input:**
```json
{
  "email": "user@example.com",
  "password": "min6chars",
  "displayName": "Rahim"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Errors:** `CONFLICT` — email already registered

---

### `auth.signIn` — Login

**Auth required:** No

**Input:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "roles": ["user"],
    "profile": {
      "id": "uuid",
      "user_id": "uuid",
      "display_name": "Rahim",
      "bio": null,
      "avatar_url": null,
      "phone": null,
      "preferred_language": "bn",
      "is_active": true,
      "referral_code": "ABC123",
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

Roles can be: `user`, `writer`, `publisher`, `narrator`, `rj`, `moderator`, `admin`

**Errors:** `UNAUTHORIZED` — wrong credentials | `FORBIDDEN` — account deactivated

---

### `auth.refresh` — Refresh tokens

**Auth required:** No

**Input:**
```json
{
  "refreshToken": "eyJ..."
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors:** `UNAUTHORIZED` — invalid or expired refresh token

---

### `auth.me` — Get current user

**Auth required:** Yes

**Input:** none

**Response:** Same shape as `signIn` user object (without tokens)

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "roles": ["user"],
  "profile": { ... }
}
```

---

### `auth.updateProfile` — Update profile via auth router

**Auth required:** Yes

**Input:** (all optional)
```json
{
  "display_name": "Rahim",
  "bio": "Book lover",
  "avatar_url": "https://...",
  "phone": "+880...",
  "preferred_language": "bn",
  "website_url": "https://...",
  "facebook_url": "https://...",
  "instagram_url": "https://...",
  "youtube_url": "https://..."
}
```

**Response:**
```json
{ "success": true }
```

---

## Router: `profiles`

### `profiles.me` — Get full profile

**Auth required:** Yes  
**Input:** none  
**Response:** Full profile object from database

---

### `profiles.update` — Update profile

**Auth required:** Yes

**Input:** (all optional — superset of `auth.updateProfile`)
```json
{
  "display_name": "string",
  "full_name": "string",
  "bio": "string",
  "avatar_url": "https://...",
  "preferred_language": "bn",
  "genre": "string",
  "specialty": "string",
  "experience": "string",
  "phone": "string",
  "website_url": "string",
  "facebook_url": "string",
  "instagram_url": "string",
  "youtube_url": "string",
  "portfolio_url": "string"
}
```

**Response:** Updated profile object

---

### `profiles.readingProgress` — Get reading history

**Auth required:** Yes  
**Input:** none  

**Response:** Array of reading progress entries
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "book_id": "uuid",
    "current_page": 42,
    "total_pages": 300,
    "percentage": 14.0,
    "last_read_at": "2025-01-01T00:00:00.000Z",
    "book": {
      "id": "uuid",
      "title": "বইয়ের নাম",
      "author": { "id": "uuid", "name": "লেখকের নাম" },
      "formats": [{ "id": "uuid", "format": "ebook" }]
    }
  }
]
```

---

### `profiles.updateReadingProgress` — Save reading position

**Auth required:** Yes

**Input:**
```json
{
  "bookId": "uuid",
  "currentPage": 42,
  "totalPages": 300
}
```

**Response:** Updated progress object (upsert — creates or updates)

---

### `profiles.updateListeningProgress` — Save audiobook position

**Auth required:** Yes

**Input:**
```json
{
  "bookId": "uuid",
  "currentPosition": 3600.5,
  "totalDuration": 28800.0,
  "currentTrack": 3
}
```

`currentPosition` and `totalDuration` are in **seconds**.  
**Response:** Updated listening progress object

---

### `profiles.userRoles` — List user roles

**Auth required:** Yes  
**Input:** none  
**Response:** Array of role records `[{ "id": "uuid", "user_id": "uuid", "role": "user" }]`

---

### `profiles.hasRole` — Check single role

**Auth required:** Yes

**Input:**
```json
{ "role": "writer" }
```

**Response:**
```json
{ "hasRole": false }
```

---

### `profiles.permissionOverrides` — Get permission overrides

**Auth required:** Yes  
**Input:** none  
**Response:** `[{ "permission_key": "string", "is_allowed": true }]`

---

### `profiles.presence` — Update online presence

**Auth required:** Yes

**Input:**
```json
{
  "activityType": "reading",
  "currentBookId": "uuid",
  "currentPage": "/book/slug",
  "sessionId": "session-uuid"
}
```

`activityType` default: `"browsing"`. Call periodically (every 30–60s) while user is active.  
**Response:** Presence record

---

## Router: `books`

### `books.list` — Paginated book catalogue

**Auth required:** No

**Input:** (all optional)
```json
{
  "limit": 20,
  "cursor": "last-book-id",
  "categoryId": "uuid",
  "search": "রবীন্দ্রনাথ",
  "isFeatured": true,
  "isBestseller": false,
  "isFree": false,
  "language": "bn",
  "authorId": "uuid",
  "publisherId": "uuid"
}
```

**Response:**
```json
{
  "books": [
    {
      "id": "uuid",
      "title": "গল্পগুচ্ছ",
      "title_en": "Short Stories",
      "slug": "golpoguccho",
      "cover_url": "https://...",
      "description": "...",
      "is_featured": true,
      "is_bestseller": false,
      "is_free": false,
      "language": "bn",
      "total_reads": 1500,
      "avg_rating": 4.5,
      "author": { "id": "uuid", "name": "রবীন্দ্রনাথ", "name_en": "Rabindranath", "avatar_url": null },
      "publisher": { "id": "uuid", "name": "প্রকাশনী", "name_en": "Publisher", "logo_url": null },
      "category": { "id": "uuid", "name": "উপন্যাস", "slug": "novel" },
      "formats": [
        {
          "id": "uuid",
          "format": "ebook",
          "price": 150,
          "original_price": 200,
          "discount": 25,
          "coin_price": 50,
          "pages": 320,
          "duration": null,
          "in_stock": true,
          "is_available": true
        }
      ]
    }
  ],
  "nextCursor": "uuid-of-last-item"
}
```

`nextCursor` is `null` when no more pages exist. Pass it as `cursor` for the next page.

**Format values:** `ebook`, `audiobook`, `hardcover`, `paperback`

---

### `books.byId` — Get book by ID

**Auth required:** No

**Input:**
```json
{ "id": "uuid" }
```

**Response:** Full book object with `author`, `publisher`, `category`, `formats` (including narrator details)

**Errors:** `NOT_FOUND`

---

### `books.bySlug` — Get book by slug

**Auth required:** No

**Input:**
```json
{ "slug": "golpoguccho" }
```

**Response:** Same as `byId`

**Errors:** `NOT_FOUND`

---

### `books.categories` — List active categories

**Auth required:** No  
**Input:** none  
**Response:** `[{ "id": "uuid", "name": "উপন্যাস", "slug": "novel", "priority": 10, "status": "active" }]`

---

### `books.heroBanners` — Get homepage banners

**Auth required:** No  
**Input:** none  
**Response:** Array of active banners ordered by `sort_order`

---

### `books.reviews` — Get book reviews

**Auth required:** No

**Input:**
```json
{
  "bookId": "uuid",
  "limit": 20
}
```

**Response:** Array of approved reviews

---

### `books.postReview` — Submit a review

**Auth required:** Yes

**Input:**
```json
{
  "bookId": "uuid",
  "rating": 4,
  "comment": "দারুণ বই!"
}
```

`rating`: 1–5. Review is created with `status: "pending"` and requires admin approval.  
**Response:** Review object

---

### `books.bookmark` — Toggle bookmark

**Auth required:** Yes

**Input:**
```json
{ "bookId": "uuid" }
```

**Response:**
```json
{ "bookmarked": true }
```

Calling again toggles it off: `{ "bookmarked": false }`

---

### `books.isBookmarked` — Check bookmark status

**Auth required:** Yes

**Input:**
```json
{ "bookId": "uuid" }
```

**Response:**
```json
{ "bookmarked": false }
```

---

### `books.userBookmarks` — List all bookmarks

**Auth required:** Yes  
**Input:** none  
**Response:** Array of bookmark objects, each including the `book` with author and formats

---

### `books.incrementRead` — Track a book read

**Auth required:** Yes

**Input:**
```json
{ "bookId": "uuid" }
```

Call once when a user opens a book. Increments the book's `total_reads` counter.  
**Response:** void

---

### `books.narrators` — List narrators

**Auth required:** No  
**Input:** none  
**Response:** Array of active narrators ordered by priority

---

### `books.authors` — List authors

**Auth required:** No  
**Input:** none  
**Response:** Array of active authors ordered by priority

---

### `books.homepageSections` — Get homepage layout

**Auth required:** No  
**Input:** none  
**Response:** Array of enabled sections ordered by `sort_order`

---

### `books.siteSettings` — Get site configuration

**Auth required:** No  
**Input:** none  
**Response:** Array of `[{ "key": "string", "value": "string" }]` settings

---

## Router: `orders`

### `orders.myOrders` — List user orders

**Auth required:** Yes

**Input:** (optional)
```json
{
  "limit": 20,
  "cursor": "last-order-id"
}
```

**Response:**
```json
{
  "orders": [
    {
      "id": "uuid",
      "order_number": "ORD-1699999999-ABC1",
      "status": "pending",
      "total_amount": 450,
      "payment_method": "bkash",
      "created_at": "2025-01-01T00:00:00.000Z",
      "items": [
        {
          "id": "uuid",
          "format": "ebook",
          "price": 150,
          "quantity": 1,
          "book_format": {
            "book": {
              "id": "uuid",
              "title": "গল্পগুচ্ছ",
              "cover_url": "https://..."
            }
          }
        }
      ],
      "payments": []
    }
  ],
  "nextCursor": null
}
```

**Order status values:** `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`

---

### `orders.byId` — Get order detail

**Auth required:** Yes

**Input:**
```json
{ "id": "uuid" }
```

**Response:** Full order object including `items`, `payments`, and `status_history`

**Errors:** `NOT_FOUND` (also returned if the order belongs to another user)

---

### `orders.create` — Place an order

**Auth required:** Yes

**Input:**
```json
{
  "items": [
    { "bookFormatId": "uuid", "quantity": 1 }
  ],
  "shippingName": "রহিম উদ্দিন",
  "shippingPhone": "+8801700000000",
  "shippingAddress": "১২৩ মেইন স্ট্রিট",
  "shippingCity": "ঢাকা",
  "shippingDistrict": "ঢাকা",
  "shippingArea": "মিরপুর",
  "shippingMethodId": "uuid",
  "couponCode": "SAVE10",
  "paymentMethod": "bkash"
}
```

Only `items` is required. Shipping fields are needed for physical formats (`hardcover`, `paperback`).  
**Response:** Created order object with items

**Errors:** `BAD_REQUEST` — format not found

---

## Router: `wallet`

### `wallet.balance` — Get wallet and transactions

**Auth required:** Yes  
**Input:** none  

**Response:**
```json
{
  "wallet": {
    "id": "uuid",
    "user_id": "uuid",
    "balance": 250,
    "total_earned": 500,
    "total_spent": 250,
    "updated_at": "2025-01-01T00:00:00.000Z"
  },
  "transactions": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "amount": 10,
      "type": "earn",
      "description": "Daily login reward",
      "source": "daily_login",
      "reference_id": null,
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

`wallet` may be `null` if the user has never earned/spent coins. `transactions` shows last 50.

**Transaction types:** `earn`, `spend`, `bonus`, `refund`

---

### `wallet.adjustCoins` — Add or deduct coins

**Auth required:** Yes

**Input:**
```json
{
  "amount": 100,
  "type": "earn",
  "description": "Referral bonus",
  "referenceId": "optional-uuid",
  "source": "referral"
}
```

Use a negative `amount` to deduct (e.g. `-50`). The balance cannot go below 0.  
**Response:** Updated wallet object

**Errors:** `BAD_REQUEST` — insufficient coins (on deduct)

---

### `wallet.unlockContent` — Unlock a book with coins

**Auth required:** Yes

**Input:**
```json
{
  "bookId": "uuid",
  "format": "ebook",
  "coinCost": 50
}
```

**Response:**
```json
{ "success": true }
```

or if already unlocked:
```json
{ "already_unlocked": true }
```

**Errors:** `BAD_REQUEST` — insufficient coins

---

### `wallet.checkUnlock` — Check if content is unlocked

**Auth required:** Yes

**Input:**
```json
{
  "bookId": "uuid",
  "format": "ebook"
}
```

**Response:**
```json
{ "unlocked": true }
```

---

### `wallet.userUnlocks` — List all unlocked content

**Auth required:** Yes  
**Input:** none  
**Response:** Array of active `ContentUnlock` records

---

### `wallet.checkHybridAccess` — Check full access (coin + subscription + purchase)

**Auth required:** Yes

**Input:**
```json
{
  "bookId": "uuid",
  "format": "ebook"
}
```

`format` must be `"ebook"` or `"audiobook"`.

**Response:**
```json
{
  "granted": true,
  "method": "subscription"
}
```

`method` values: `"coin"`, `"subscription"`, `"purchase"`, `"none"`

Use this to gate content reading/listening screens.

---

## Router: `gamification`

### `gamification.streaks` — Get current streak

**Auth required:** Yes  
**Input:** none  

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "current_streak": 7,
  "best_streak": 14,
  "last_activity_date": "2025-01-01"
}
```

Returns `null` if the user has no streak yet.

---

### `gamification.updateStreak` — Record today's activity

**Auth required:** Yes  
**Input:** none  

Call once per day when the user opens the app. Consecutive days increment `current_streak`.  
**Response:** Updated streak object

---

### `gamification.addPoints` — Award XP points

**Auth required:** Yes

**Input:**
```json
{
  "points": 10,
  "eventType": "book_read",
  "referenceId": "book-uuid"
}
```

**Response:** Created points record

---

### `gamification.totalPoints` — Get total XP

**Auth required:** Yes  
**Input:** none  

**Response:**
```json
{ "total": 1250 }
```

---

### `gamification.badges` — Get earned badges

**Auth required:** Yes  
**Input:** none  
**Response:** Array of `UserBadge` with nested `badge` definition, ordered by `earned_at` desc

---

### `gamification.badgeDefinitions` — List all badge types

**Auth required:** Yes  
**Input:** none  
**Response:** Array of `BadgeDefinition` ordered by `sort_order`

---

### `gamification.goals` — Get user reading goals

**Auth required:** Yes  
**Input:** none  
**Response:** Array of `UserGoal` records

---

### `gamification.logActivity` — Log user activity

**Auth required:** Yes

**Input:**
```json
{
  "action": "page_read",
  "activityType": "reading",
  "bookId": "uuid",
  "format": "ebook",
  "page": "42",
  "metadata": { "timeSpent": 120 }
}
```

All fields except `action` are optional.  
**Response:** Created activity log record

---

### `gamification.logConsumptionTime` — Track time spent

**Auth required:** Yes

**Input:**
```json
{
  "bookId": "uuid",
  "format": "ebook",
  "seconds": 300
}
```

Call periodically (e.g. on app pause/background) with the seconds spent since last call.  
**Response:** Created time record

---

### `gamification.claimDailyReward` — Claim daily login coins

**Auth required:** Yes  
**Input:** none  

**Response (success):**
```json
{ "success": true, "reward": 10 }
```

**Response (already claimed today):**
```json
{ "success": false, "reason": "already_claimed" }
```

Reward: **10 coins** per day.

---

### `gamification.claimAdReward` — Earn coins by watching an ad

**Auth required:** Yes

**Input:**
```json
{ "placement": "home_banner" }
```

`placement` defaults to `"general"`. Track which placement triggered the reward.  

**Response (success):**
```json
{ "success": true, "reward": 5 }
```

**Response (daily limit reached):**
```json
{ "success": false, "reason": "daily_limit_reached" }
```

Reward: **5 coins** per ad, max **5 ads per day** (25 coins/day max from ads).

---

## Router: `notifications`

### `notifications.list` — Get notifications

**Auth required:** Yes

**Input:** (optional)
```json
{
  "limit": 30,
  "unreadOnly": false
}
```

**Response:** Array of `UserNotification` with nested `notification` object

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "is_read": false,
    "read_at": null,
    "created_at": "2025-01-01T00:00:00.000Z",
    "notification": {
      "id": "uuid",
      "title": "নতুন বই",
      "body": "আপনার পছন্দের লেখকের নতুন বই এসেছে",
      "type": "new_book",
      "action_url": "/book/slug"
    }
  }
]
```

---

### `notifications.unreadCount` — Get unread count

**Auth required:** Yes  
**Input:** none  

**Response:** Integer (the raw count, not an object)

```json
3
```

---

### `notifications.markRead` — Mark one notification as read

**Auth required:** Yes

**Input:**
```json
{ "id": "uuid" }
```

**Response:** Prisma update result

---

### `notifications.markAllRead` — Mark all as read

**Auth required:** Yes  
**Input:** none  
**Response:** Prisma update result

---

### `notifications.preferences` — Get notification preferences

**Auth required:** Yes  
**Input:** none  

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "email_enabled": true,
  "push_enabled": true,
  "order_enabled": true,
  "promotional_enabled": true,
  "reminder_enabled": true,
  "support_enabled": true
}
```

Returns `null` if the user has never set preferences (treat as all enabled).

---

### `notifications.updatePreferences` — Save notification settings

**Auth required:** Yes

**Input:** (all optional)
```json
{
  "email_enabled": true,
  "push_enabled": false,
  "order_enabled": true,
  "promotional_enabled": false,
  "reminder_enabled": true,
  "support_enabled": true
}
```

**Response:** Updated or created preferences object

---

## Complete Flow Examples

### Login and Bootstrap

```
1. POST /trpc/auth.signIn?batch=1
   Body: {"0": {"email": "...", "password": "..."}}
   → Save accessToken + refreshToken

2. GET /trpc/wallet.balance?batch=1&input={"0":{}}
   Header: Authorization: Bearer <accessToken>
   → Show coin balance

3. GET /trpc/notifications.unreadCount?batch=1&input={"0":{}}
   → Show badge on bell icon

4. POST /trpc/gamification.updateStreak?batch=1
   Body: {"0": {}}
   → Update daily streak

5. POST /trpc/gamification.claimDailyReward?batch=1
   Body: {"0": {}}
   → Grant 10 coins if not yet claimed today
```

---

### Browse and Open a Book

```
1. GET /trpc/books.list?batch=1&input={"0":{"limit":20,"isFeatured":true}}
   → Homepage featured books

2. GET /trpc/books.bySlug?batch=1&input={"0":{"slug":"golpoguccho"}}
   → Book detail page

3. GET /trpc/wallet.checkHybridAccess?batch=1&input={"0":{"bookId":"uuid","format":"ebook"}}
   → If granted: open reader
   → If not granted: show purchase/unlock screen

4. POST /trpc/books.incrementRead?batch=1
   Body: {"0": {"bookId": "uuid"}}
   → Track read count
```

---

### Save Reading Progress

```
POST /trpc/profiles.updateReadingProgress?batch=1
Body: {"0": {"bookId": "uuid", "currentPage": 42, "totalPages": 300}}

POST /trpc/gamification.logConsumptionTime?batch=1
Body: {"0": {"bookId": "uuid", "format": "ebook", "seconds": 180}}
```

---

### Token Refresh Flow

```
On receiving HTTP 401:

POST /trpc/auth.refresh?batch=1
Body: {"0": {"refreshToken": "<stored_refresh_token>"}}
→ Save new accessToken + refreshToken
→ Retry original request
```

If refresh also returns 401, the session is expired — redirect to login.

---

### Place an Order

```
POST /trpc/orders.create?batch=1
Body:
{
  "0": {
    "items": [{"bookFormatId": "uuid", "quantity": 1}],
    "shippingName": "রহিম",
    "shippingPhone": "+8801700000000",
    "shippingAddress": "ঢাকা",
    "paymentMethod": "bkash"
  }
}
→ Returns order with order_number for payment reference
```

---

## Data Model Notes

- All IDs are UUIDs (string).
- All timestamps are ISO 8601 strings in UTC.
- `cover_url`, `avatar_url`, `logo_url` are absolute URLs or `null`.
- Prices are in **BDT (Bangladeshi Taka)** as integers.
- Coin prices are integers (whole coins).
- `percentage` fields are 0–100 floats.
- Audio `duration` is in seconds (float). `currentPosition` / `totalDuration` in listening progress are also seconds.
- Pagination uses cursor-based paging; `nextCursor` is the ID of the last item returned. Pass it as `cursor` in the next request. `null` means end of list.
