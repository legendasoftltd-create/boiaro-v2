# BoiAro REST API — Mobile Reference

**Version:** 2.1  
**Base URL (local):** `http://localhost:3001/api/v1`  
**Base URL (staging):** `https://staging.boiaro.com/api/v1`

---

## Global Rules

### Required Headers

| Header | Value |
| :--- | :--- |
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <accessToken>` *(protected endpoints only)* |

### Response Envelope

All responses are JSON. Error responses always follow:

```json
{ "error": "Error message description" }
```

Validation errors:

```json
{
  "message": "Validation failed",
  "issues": { "fieldErrors": { "email": ["Invalid email"] } }
}
```

### HTTP Status Codes

| Code | Meaning |
| :--- | :--- |
| 200 | Success |
| 201 | Resource created |
| 400 | Bad request / missing params |
| 401 | Authentication required |
| 403 | Forbidden (deactivated/deleted account) |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |
| 422 | Validation error (e.g. weak password) |
| 500 | Internal server error |

### Pagination

Paginated endpoints accept:

- `limit` (int, default 20, max 50–100 depending on endpoint)
- `offset` (int, default 0)

And return `total` alongside the data array.

---

## 1. Authentication

### `POST /auth/signup`

Create a new user account.

| | |
| :--- | :--- |
| Auth required | No |

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "min6chars",
  "display_name": "Optional Name"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| email | string | ✅ | User email address |
| password | string | ✅ | Min 6 characters |
| display_name | string | ❌ | User display name |

**Success (201):**
```json
{ "message": "Signup successful. Please verify your email." }
```

**Error (400):** `{ "error": "Missing required fields" }`  
**Error (409):** `{ "error": "Email already registered" }`  
**Error (422):** `{ "error": "Password must be at least 6 characters" }`

---

### `POST /auth/login`

Sign in with email/password. Returns JWT tokens.

| | |
| :--- | :--- |
| Auth required | No |

**Request body:**

```json
{ "email": "user@example.com", "password": "userpassword" }
```

**Success (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600,
  "user_id": "uuid",
  "user": { "email": "user@example.com" }
}
```

**Error (401):** `{ "error": "Invalid email or password" }`  
**Error (403):** `{ "error": "Account deactivated. Contact support." }`

---

### `POST /auth/refresh`

Refresh an expired access token.

| | |
| :--- | :--- |
| Auth required | No |

**Request body:**

```json
{ "refresh_token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Success (200):**
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",
  "expires_in": 3600
}
```

**Error (400):** `{ "error": "Missing refresh_token" }`

---

### `POST /auth/logout`

Server-side logout acknowledgment. Client should discard tokens.

| | |
| :--- | :--- |
| Auth required | Yes |

**Request body:** None

**Success (200):** `{ "message": "Logged out successfully" }`

---

### `POST /auth/reset-password`

Send a password reset email.

| | |
| :--- | :--- |
| Auth required | No |

**Request body:**

```json
{ "email": "user@example.com" }
```

**Success (200):** `{ "message": "Password reset email sent" }`

---

### `POST /auth/update-password`

Set a new password for the authenticated user.

| | |
| :--- | :--- |
| Auth required | Yes |

**Request body:**

```json
{ "password": "new_secure_password" }
```

**Success (200):** `{ "message": "Password updated successfully" }`  
**Error (422):** `{ "error": "Password must be at least 6 characters" }`

---

### `GET /auth/me`

Get the current authenticated user.

| | |
| :--- | :--- |
| Auth required | Yes |

**Success (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "roles": ["user"],
  "profile": { "display_name": "User" }
}
```

---

## 2. User Profile

### `GET /profile`

Get the current user's profile.

| | |
| :--- | :--- |
| Auth required | Yes |

**Success (200):**
```json
{
  "userProfile": {
    "id": "user_id",
    "email": "user@example.com",
    "roles": [{ "role": "user" }],
    "profile": { "display_name": "User" },
    "created_at": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `PATCH /profile`

Update profile fields. Only send fields you want to change.

| | |
| :--- | :--- |
| Auth required | Yes |

**Allowed fields:**

| Field | Type |
| :--- | :--- |
| display_name | string |
| full_name | string |
| avatar_url | string |
| bio | string |
| preferred_language | string (`"bn"` or `"en"`) |

**Request body:**
```json
{ "display_name": "New Name", "bio": "Updated bio" }
```

**Success (200):** `{ "success": true, "message": "Profile updated" }`

---

### `GET /profile/roles`

Get the authenticated user's assigned roles.

| | |
| :--- | :--- |
| Auth required | Yes |

**Success (200):**
```json
{ "roles": ["user"] }
```

---

## 3. Books & Content Discovery

### `GET /books`

List approved books with pagination and optional filters. No auth required.

**Query params:**

| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| limit | int | 20 | Results per page (max 100) |
| cursor | string | — | Cursor-based pagination |
| categoryId | uuid | — | Filter by category |
| isFeatured | boolean | — | Featured books only |
| isBestseller | boolean | — | Bestseller books only |
| isFree | boolean | — | Free books only |
| language | string | — | Filter by language |
| authorId | uuid | — | Filter by author |
| publisherId | uuid | — | Filter by publisher |
| search | string | — | Search by title |

**Success (200):**
```json
{
  "books": [
    {
      "id": "uuid",
      "title": "বাংলা টাইটেল",
      "title_en": "English Title",
      "slug": "url-slug",
      "cover_url": "https://...",
      "is_free": false,
      "is_featured": true,
      "is_bestseller": true,
      "language": "bn",
      "avg_rating": 4.5,
      "total_reads": 1200,
      "author": { "id": "uuid", "name": "Author Name", "avatar_url": "https://..." },
      "formats": [{ "id": "uuid", "format": "ebook", "price": 90, "coin_price": 50 }]
    }
  ],
  "nextCursor": "uuid-of-last-item"
}
```

---

### `GET /books/:id`

Get one approved book by database id. No auth required.

**Success (200):** Full book object with `author`, `publisher`, `category`, `formats`.  
**Error (404):** `{ "error": "Book not found" }`

---

### `GET /books/slug/:slug`

Get one approved book by slug. No auth required.

```http
GET /api/v1/books/slug/chander-pahar
```

**Success (200):** Same as `GET /books/:id`  
**Error (404):** `{ "error": "Book not found" }`

---

### `GET /books/categories/list`

Get active categories (short list format). No auth required.

**Success (200):**
```json
[
  { "id": "uuid", "name": "Fiction", "slug": "fiction" }
]
```

---

### `GET /books/:id/reviews`

Get approved reviews for a book. No auth required.

**Query params:** `limit` (int, default 50, max 100)

**Success (200):**
```json
[
  {
    "id": "uuid",
    "rating": 5,
    "comment": "Great book",
    "display_name": "Akram"
  }
]
```

---

### `POST /books/:id/reviews`

Submit or update a review. 🔒 Auth required.

**Request body:**
```json
{ "rating": 5, "comment": "Excellent read" }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| rating | int | ✅ | Rating 1–5 |
| comment | string | ❌ | Review text |

**Success (200):** Returns the review object.

---

### `GET /books/:id/bookmark`

Check bookmark status for a book. 🔒 Auth required.

**Success (200):** `{ "bookmarked": true }`

---

### `POST /books/:id/bookmark`

Toggle bookmark state. 🔒 Auth required.

**Success (200):** `{ "bookmarked": true }`

---

### `GET /books/:book_id/tracks`

List audiobook tracks for a book. No auth required.

**Success (200):**
```json
{
  "tracks": [
    {
      "id": "uuid",
      "track_number": 1,
      "title": "অধ্যায় ১",
      "duration": "12:30",
      "is_preview": true,
      "media_type": "audio",
      "chapter_price": null,
      "status": "active"
    }
  ]
}
```

Returns `{ "tracks": [] }` if no audiobook format exists.

---

### `GET /categories`

List all active categories (full detail). No auth required.

**Success (200):**
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "উপন্যাস",
      "name_bn": "উপন্যাস",
      "name_en": "Novel",
      "icon": "BookOpen",
      "color": "from-amber-50 to-orange-50",
      "slug": "novel",
      "is_featured": true,
      "is_trending": false,
      "priority": 1
    }
  ]
}
```

---

### `GET /authors`

List authors with pagination. No auth required.

**Query params:** `limit` (int, default 20), `offset` (int, default 0)

**Success (200):**
```json
{
  "authors": [
    {
      "id": "uuid",
      "name": "বিভূতিভূষণ",
      "name_en": "Bibhutibhushan",
      "avatar_url": "https://...",
      "bio": "...",
      "genre": "Adventure",
      "is_featured": true,
      "is_trending": false,
      "priority": 1
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

### `GET /authors/:id`

Get a single author's details. No auth required.

**Success (200):** Author object.  
**Error (404):** `{ "error": "Author not found" }`

---

### `GET /narrators`

List all active narrators. No auth required.

**Success (200):**
```json
{
  "narrators": [
    {
      "id": "uuid",
      "name": "ন্যারেটর নাম",
      "name_en": "Narrator Name",
      "avatar_url": "https://...",
      "bio": "...",
      "specialty": "Fiction",
      "rating": 4.8,
      "is_featured": true,
      "is_trending": false
    }
  ]
}
```

---

### `GET /publishers`

List all active publishers. No auth required.

**Success (200):**
```json
{
  "publishers": [
    {
      "id": "uuid",
      "name": "আনন্দ পাবলিশার্স",
      "name_en": "Ananda Publishers",
      "logo_url": "https://...",
      "description": "...",
      "is_verified": true,
      "is_featured": true
    }
  ]
}
```

---

### `GET /search`

Search books by title. No auth required.

**Query params:** `q` (string, required, min 2 chars)

**Success (200):**
```json
{
  "results": [
    {
      "id": "uuid",
      "title": "চাঁদের পাহাড়",
      "title_en": "Chander Pahar",
      "slug": "chander-pahar",
      "cover_url": "https://...",
      "rating": null,
      "is_free": false,
      "author": { "name": "বিভূতিভূষণ" }
    }
  ]
}
```

**Error (400):** `{ "error": "Search query too short (min 2 chars)" }`

---

### `GET /homepage`

Fetch all homepage sections in a single call. No auth required. If authenticated, includes `currentUser`, `continueReading`, and `continueListening`.

**Query params:**

- `limit` (int, optional, default 10, max 50)
- `type` (string, optional): `ebook`, `audiobook`, `hardcopy`

**Success (200):**
```json
{
  "currentUser": { "...": "..." },
  "continueListening": [],
  "continueReading": [],
  "radio": { "station": {}, "liveSession": {} },
  "popularBooks": [],
  "BecauseYouRead": [],
  "editorsPick": [],
  "appDownload": [],
  "trendingNow": { "trendingNow": [], "ebooks": [], "audiobooks": [], "hardCopies": [] },
  "popularAudiobooks": [],
  "popularHardCopies": [],
  "popularEbooks": [],
  "topTenMostRead": [],
  "slider": { "slider": [] },
  "allCategory": [],
  "allAuthor": [],
  "allNarrators": [],
  "countsValue": { "counts": {}, "totalNarrators": 0 },
  "NewReleases": { "all": [], "ebooks": [], "audiobooks": [] },
  "FreeBooks": []
}
```

---

### `GET /homepage/:section`

Fetch a single homepage section only. No auth required. If authenticated, user-specific sections (`currentUser`, `continueReading`, `continueListening`) are populated.

**Query params:**

- `limit` (int, optional, default 10, max 50)
- `type` (string, optional): `ebook`, `audiobook`, `hardcopy`

**Path params:** `section` (string, required)

Supported section keys:

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

**Success (200):**
```json
{
  "section": "popularBooks",
  "data": []
}
```

**Error (404):** `{ "error": "Homepage section not found" }`

---

### `GET /footer`

Returns footer/site setting data.

**Success (200):**
```json
{
  "footerData": [
    { "key": "brand_name", "value": "BoiAro" }
  ]
}
```

---

## 4. Access Control

### `POST /access/check`

Check if user has access to a specific book format. 🔒 Auth required.

**Request body:**
```json
{
  "book_id": "uuid",
  "format": ["ebook", "audiobook"]
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ✅ | Book ID |
| format | string or string[] | ✅ | `"ebook"`, `"audiobook"`, or `"hardcopy"` |

**Success (200):**
```json
{
  "has_access": true,
  "access_method": "free",
  "is_free": true,
  "has_subscription": false,
  "has_purchase": false,
  "has_unlock": false
}
```

**Error (404):** `{ "error": "Book not found" }`

---

### `GET /access/preview-eligibility`

Check preview availability for any book/format. No auth required.

**Query params:**

| Param | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ✅ |
| format | string | ❌ (default `"ebook"`) |

**Success (200):**
```json
{
  "is_free": false,
  "preview_percentage": 15,
  "preview_chapters": 2,
  "price": 90,
  "guest_preview_allowed": true
}
```

**Error (404):** `{ "error": "Book not found" }`

---

## 5. Secure Content URLs

### `POST /content/ebook-url`

Get a signed URL for ebook file access. 🔒 Auth required + purchase/unlock.

**Request body:**
```json
{ "book_id": "uuid" }
```

**Success (200):**
```json
{
  "signed_url": "/uploads/bookPdf/file.epub?token=secure_token&expires=...",
  "mime_type": "application/epub+zip",
  "expires_in": 300
}
```

**Error (401):** `{ "error": "Access denied" }`  
**Error (404):** `{ "error": "Ebook file not found" }`

---

### `POST /content/audio-url`

Get a signed URL for a specific audio track. Works for guests (preview) and authenticated users.

**Request body:**
```json
{ "book_id": "uuid", "track_number": 1 }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ✅ | Book ID |
| track_number | int | ❌ | Track to fetch (default: 1) |

**Success (200):**
```json
{
  "signed_url": "https://...?token=secure_token&expires=...",
  "expires_in": 300
}
```

**Error (404):** `{ "error": "Track not found" }`

---

### `POST /content/batch-audio-urls`

Get signed URLs for all tracks at once. 🔒 Auth required.

**Request body:**
```json
{ "book_id": "uuid" }
```

**Success (200):**
```json
{
  "tracks": [
    {
      "track_number": 1,
      "signed_url": "https://...?token=secure_token&expires=...",
      "expires_in": 300
    }
  ]
}
```

---

## 6. Reading & Listening Progress

### `GET /progress/reading`

Get reading progress for a specific book. 🔒 Auth required.

**Query params:** `book_id` (uuid, required)

**Success (200):**
```json
{
  "current_page": 78,
  "total_pages": 320,
  "percentage": 24,
  "last_read_at": "2026-04-05T12:30:00.000Z"
}
```

Returns default if no progress exists:
```json
{ "current_page": 0, "total_pages": 0, "percentage": 0, "last_read_at": null }
```

---

### `PUT /progress/reading`

Save or update reading progress. 🔒 Auth required.

**Request body:**
```json
{ "book_id": "uuid", "current_page": 100, "total_pages": 320 }
```

| Field | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ✅ |
| current_page | int | ✅ |
| total_pages | int | ✅ |

**Success (200):** `{ "message": "Reading progress saved" }`

---

### `GET /progress/listening`

Get listening progress for a specific audiobook. 🔒 Auth required.

**Query params:** `book_id` (uuid, required)

**Success (200):**
```json
{
  "current_track": 2,
  "position_seconds": 45,
  "total_seconds": 945,
  "last_listened_at": "2026-04-05T12:30:00.000Z"
}
```

Returns default if no progress exists:
```json
{ "current_track": 1, "position_seconds": 0, "total_seconds": 0, "last_listened_at": null }
```

---

### `PUT /progress/listening`

Save or update listening progress. 🔒 Auth required.

**Request body:**
```json
{
  "book_id": "uuid",
  "track_number": 2,
  "position_seconds": 45,
  "total_seconds": 945
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ✅ |
| track_number | int | ❌ (default 1) |
| position_seconds | int | ❌ (default 0) |
| total_seconds | int | ❌ (default 0) |

**Success (200):** `{ "message": "Listening progress saved" }`

---

## 7. Bookmarks

### `GET /me/bookmarks`

Get all bookmarked books. 🔒 Auth required.

**Success (200):**
```json
[
  {
    "id": "bookmark_id",
    "book_id": "uuid",
    "book": {
      "id": "uuid",
      "title": "Book Title",
      "author": { "id": "uuid", "name": "Author Name" },
      "formats": [{ "id": "uuid", "format": "ebook", "price": 120 }]
    }
  }
]
```

---

## 8. Wallet & Coins

### `GET /wallet`

Get coin balance. 🔒 Auth required.

**Success (200):**
```json
{
  "balance": 250,
  "total_earned": 500,
  "total_spent": 250
}
```

---

### `GET /wallet/transactions`

Get coin transaction history. 🔒 Auth required.

**Query params:** `limit` (int, default 50, max 100)

**Success (200):**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "amount": 10,
      "type": "earn",
      "description": "Daily login reward",
      "source": "daily_login",
      "created_at": "2026-04-05T10:00:00.000Z",
      "expires_at": null
    }
  ]
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| amount | int | Positive = earned, Negative = spent |
| type | string | `"earn"`, `"spend"`, `"bonus"`, `"refund"` |
| source | string/null | `"daily_login"`, `"ad_reward"`, `"content_unlock"`, `"purchase"`, etc. |

---

### `POST /wallet/claim-daily`

Claim daily login reward coins. 🔒 Auth required.

**Request body:** None

**Success (200):**
```json
{ "reward": 10, "message": "Daily reward claimed", "new_balance": 260 }
```

**Error (400):** `{ "error": "Daily reward already claimed" }`

---

### `POST /wallet/claim-ad`

Claim ad watch reward. 🔒 Auth required.

**Request body:**
```json
{ "placement": "general" }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| placement | string | ❌ | Ad placement key (default: `"general"`) |

**Success (200):**
```json
{ "reward": 1, "message": "Ad reward claimed", "new_balance": 261 }
```

**Error (400):** `{ "error": "Daily ad reward limit reached" }`

---

### `POST /wallet/unlock`

Unlock content using coins. 🔒 Auth required.

**Request body:**
```json
{ "book_id": "uuid", "format": "ebook", "coin_cost": 50 }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ✅ | Book to unlock |
| format | string | ✅ | `"ebook"` or `"audiobook"` |
| coin_cost | int | ✅ | Coins to spend (from book format's `coin_price`) |

**Success (200):**
```json
{ "success": true, "message": "Content unlocked", "new_balance": 150 }
```

**Error (400):** `{ "error": "Content already unlocked" }` or `{ "error": "Insufficient coins" }`

---

### `GET /coin-packages`

List available coin purchase packages. No auth required.

**Success (200):**
```json
{
  "packages": [
    {
      "id": "uuid",
      "coins": 100,
      "price": 99,
      "bonus_coins": 0,
      "is_popular": false,
      "is_best_value": false
    }
  ]
}
```

---

## 9. Library

### `GET /library/purchases`

Get books purchased with money. 🔒 Auth required.

**Success (200):**
```json
{
  "items": [
    {
      "book_id": "uuid",
      "format": "ebook",
      "purchased_at": "2026-04-05T10:00:00.000Z",
      "books": {
        "id": "uuid",
        "title": "Book Title",
        "cover_url": "https://...",
        "slug": "book-slug",
        "author": { "name": "Author Name" }
      }
    }
  ]
}
```

---

### `GET /library/unlocks`

Get books unlocked with coins. 🔒 Auth required.

**Success (200):**
```json
{
  "items": [
    {
      "book_id": "uuid",
      "format": "ebook",
      "unlocked_at": "2026-04-05T10:00:00.000Z",
      "books": { ... }
    }
  ]
}
```

---

### `GET /library/continue-reading`

Get books with in-progress reading (0 < percentage < 100). 🔒 Auth required.

**Success (200):**
```json
{
  "items": [
    {
      "book_id": "uuid",
      "current_page": 78,
      "total_pages": 320,
      "percentage": 24,
      "last_read_at": "2026-04-05T12:30:00.000Z",
      "books": {
        "id": "uuid",
        "title": "Title",
        "cover_url": "https://...",
        "slug": "slug",
        "author": { "name": "Author Name" }
      }
    }
  ]
}
```

Max 10 items, sorted by most recently read.

---

### `GET /library/continue-listening`

Get audiobooks with in-progress listening. 🔒 Auth required.

**Success (200):**
```json
{
  "items": [
    {
      "book_id": "uuid",
      "current_track": 3,
      "position_seconds": 120,
      "percentage": 35,
      "last_listened_at": "2026-04-05T12:30:00.000Z",
      "books": { ... }
    }
  ]
}
```

Max 10 items, sorted by most recently listened.

---

## 10. Orders & Payments

> SSLCommerz is supported in both integration styles:
>
> - REST: `POST /payments/initiate`
> - tRPC: `orders.placeOrder` with `paymentMethod = "sslcommerz"`

### `POST /orders`

Create a new order. 🔒 Auth required.

**Request body:**
```json
{
  "items": [
    { "book_id": "uuid", "format": "ebook", "quantity": 1 }
  ],
  "shipping_address": {
    "name": "রহিম আহমেদ",
    "address": "৫৩ মিরপুর রোড",
    "phone": "01712345678",
    "city": "Dhaka",
    "zip": "1216"
  },
  "payment_method": "online"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| items | array | ✅ | Array of items |
| items[].book_id | uuid | ✅ | Book ID |
| items[].format | string | ✅ | `"ebook"`, `"audiobook"`, or `"hardcopy"` |
| items[].quantity | int | ❌ | Quantity (default: 1) |
| shipping_address | object | ❌ | Required for hardcopy |
| payment_method | string | ❌ | `"online"` (default), `"cod"`, `"demo"` |

**Success (201):**
```json
{
  "id": "uuid",
  "order_number": "BOI-20260405-ABCD",
  "total_amount": 790,
  "status": "pending",
  "payment_method": "online",
  "created_at": "2026-04-05T10:00:00.000Z"
}
```

---

### `GET /orders/:order_id`

Get full order details with items. 🔒 Auth required.

**Success (200):**
```json
{
  "id": "uuid",
  "order_number": "BOI-20260405-ABCD",
  "user_id": "uuid",
  "total_amount": 790,
  "status": "confirmed",
  "payment_method": "online",
  "shipping_name": "রহিম আহমেদ",
  "shipping_address": "৫৩ মিরপুর রোড",
  "shipping_phone": "01712345678",
  "shipping_city": "Dhaka",
  "shipping_zip": "1216",
  "created_at": "2026-04-05T10:00:00.000Z",
  "updated_at": "2026-04-05T10:05:00.000Z",
  "order_items": [
    {
      "id": "uuid",
      "book_id": "uuid",
      "format": "ebook",
      "quantity": 1,
      "unit_price": 90,
      "total_price": 90,
      "books": { "id": "uuid", "title": "Book Title", "cover_url": "https://...", "slug": "slug" }
    }
  ]
}
```

**Error (404):** `{ "error": "Order not found" }`

---

### `POST /payments/initiate`

Initiate SSLCommerz payment for an order (real gateway initialization). 🔒 Auth required.

**Request body:**
```json
{ "order_id": "uuid" }
```

**Success (200):**
```json
{
  "success": true,
  "gateway_url": "https://sandbox.sslcommerz.com/EasyCheckOut/testcde...",
  "transaction_id": "TXN-1714481234567-AB12CD",
  "raw_status": "SUCCESS"
}
```

Open `gateway_url` in a WebView. After payment, SSLCommerz calls backend callback endpoints, then backend redirects to your frontend callback URL.

**Error (400):**

- `{ "error": "SSLCommerz is not enabled" }`
- `{ "error": "SSLCommerz credentials are missing" }`
- `{ "error": "Failed to initiate SSLCommerz payment" }`

**Error (404):** `{ "error": "Order not found" }`

---

### `ALL /payments/sslcommerz/success`

SSLCommerz success callback endpoint (gateway-facing). Backend validates payment (`val_id`), marks payment/order, fulfills digital access, then redirects to frontend callback URL.

---

### `ALL /payments/sslcommerz/fail`

SSLCommerz failure callback endpoint (gateway-facing). Backend updates payment status and redirects to frontend callback URL.

---

### `ALL /payments/sslcommerz/cancel`

SSLCommerz cancel callback endpoint (gateway-facing). Backend updates payment status and redirects to frontend callback URL.

---

### `POST /payments/sslcommerz/ipn`

SSLCommerz IPN endpoint (gateway-facing). Logs payment event and finalizes order for valid IPN statuses.

---

### `POST /payments/demo`

Demo/test payment — instantly marks order as paid and fulfills digital items. 🔒 Auth required. Development only.

**Request body:**
```json
{ "order_id": "uuid" }
```

**Success (200):** `{ "message": "Payment completed (demo)" }`

---

## 11. Subscriptions

### `GET /subscriptions/plans`

List active subscription plans. No auth required.

**Success (200):**
```json
{
  "plans": [
    {
      "id": "uuid",
      "name": "মাসিক সাবস্ক্রিপশন",
      "description": "সীমাহীন বই পড়ুন",
      "price": 199,
      "duration_days": 30,
      "features": ["unlimited_ebooks", "unlimited_audiobooks"],
      "is_active": true
    }
  ]
}
```

---

### `GET /subscriptions/my`

Get current user's subscriptions. 🔒 Auth required.

**Success (200):**
```json
{
  "subscriptions": [
    {
      "id": "uuid",
      "plan_id": "uuid",
      "status": "active",
      "start_date": "2026-04-01T00:00:00.000Z",
      "end_date": "2026-05-01T00:00:00.000Z",
      "subscription_plans": { "name": "মাসিক সাবস্ক্রিপশন" }
    }
  ]
}
```

---

## 12. Notifications

### `GET /notifications`

Get user notifications (most recent 50). 🔒 Auth required.

**Success (200):**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "title": "New Book Available",
      "message": "Check out our latest release!",
      "type": "new_book",
      "is_read": false,
      "created_at": "2026-04-05T10:00:00.000Z"
    }
  ]
}
```

---

### `POST /notifications/read`

Mark notifications as read. 🔒 Auth required.

**Request body:**
```json
{ "ids": ["notification-id-1", "notification-id-2"] }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| ids | uuid[] | ❌ | Specific IDs. If omitted or empty, marks ALL as read. |

**Mark all:**
```json
{}
```

**Success (200):** `{ "message": "Notifications marked as read" }`

---

## 13. Complete Endpoint List

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/auth/signup` | No | Register |
| POST | `/api/v1/auth/login` | No | Login |
| POST | `/api/v1/auth/refresh` | No | Refresh token |
| POST | `/api/v1/auth/logout` | Yes | Logout |
| POST | `/api/v1/auth/reset-password` | No | Request password reset |
| POST | `/api/v1/auth/update-password` | Yes | Update password |
| GET | `/api/v1/auth/me` | Yes | Get current user |
| GET | `/api/v1/homepage` | No | Homepage all sections (default limit 10) |
| GET | `/api/v1/homepage/:section` | No | Homepage single section (default limit 10) |
| GET | `/api/v1/footer` | No | Footer settings |
| GET | `/api/v1/profile` | Yes | Get profile |
| PATCH | `/api/v1/profile` | Yes | Update profile |
| GET | `/api/v1/profile/roles` | Yes | Get user roles |
| GET | `/api/v1/books` | No | List books |
| GET | `/api/v1/books/:id` | No | Get book by ID |
| GET | `/api/v1/books/slug/:slug` | No | Get book by slug |
| GET | `/api/v1/books/categories/list` | No | List categories (short) |
| GET | `/api/v1/books/:id/reviews` | No | Get book reviews |
| POST | `/api/v1/books/:id/reviews` | Yes | Submit review |
| GET | `/api/v1/books/:id/bookmark` | Yes | Check bookmark |
| POST | `/api/v1/books/:id/bookmark` | Yes | Toggle bookmark |
| GET | `/api/v1/books/:book_id/tracks` | No | Get audiobook tracks |
| GET | `/api/v1/categories` | No | List categories |
| GET | `/api/v1/authors` | No | List authors |
| GET | `/api/v1/authors/:id` | No | Get author |
| GET | `/api/v1/narrators` | No | List narrators |
| GET | `/api/v1/publishers` | No | List publishers |
| GET | `/api/v1/search` | No | Search books |
| POST | `/api/v1/access/check` | Yes | Check book access |
| GET | `/api/v1/access/preview-eligibility` | No | Preview eligibility |
| POST | `/api/v1/content/ebook-url` | Yes | Get ebook signed URL |
| POST | `/api/v1/content/audio-url` | No | Get audio track URL |
| POST | `/api/v1/content/batch-audio-urls` | Yes | Get all audio URLs |
| GET | `/api/v1/progress/reading` | Yes | Get reading progress |
| PUT | `/api/v1/progress/reading` | Yes | Save reading progress |
| GET | `/api/v1/progress/listening` | Yes | Get listening progress |
| PUT | `/api/v1/progress/listening` | Yes | Save listening progress |
| GET | `/api/v1/me/bookmarks` | Yes | List bookmarks |
| GET | `/api/v1/wallet` | Yes | Get wallet balance |
| GET | `/api/v1/wallet/transactions` | Yes | Transaction history |
| POST | `/api/v1/wallet/claim-daily` | Yes | Claim daily reward |
| POST | `/api/v1/wallet/claim-ad` | Yes | Claim ad reward |
| POST | `/api/v1/wallet/unlock` | Yes | Unlock content with coins |
| GET | `/api/v1/coin-packages` | No | List coin packages |
| GET | `/api/v1/library/purchases` | Yes | Purchased books |
| GET | `/api/v1/library/unlocks` | Yes | Coin-unlocked books |
| GET | `/api/v1/library/continue-reading` | Yes | Continue reading list |
| GET | `/api/v1/library/continue-listening` | Yes | Continue listening list |
| POST | `/api/v1/orders` | Yes | Create order |
| GET | `/api/v1/orders/:order_id` | Yes | Get order details |
| POST | `/api/v1/payments/initiate` | Yes | Initiate SSLCommerz payment |
| ALL | `/api/v1/payments/sslcommerz/success` | No (Gateway callback) | SSLCommerz success callback |
| ALL | `/api/v1/payments/sslcommerz/fail` | No (Gateway callback) | SSLCommerz fail callback |
| ALL | `/api/v1/payments/sslcommerz/cancel` | No (Gateway callback) | SSLCommerz cancel callback |
| POST | `/api/v1/payments/sslcommerz/ipn` | No (Gateway callback) | SSLCommerz IPN callback |
| POST | `/api/v1/payments/demo` | Yes | Demo payment |
| GET | `/api/v1/subscriptions/plans` | No | Subscription plans |
| GET | `/api/v1/subscriptions/my` | Yes | My subscriptions |
| GET | `/api/v1/notifications` | Yes | Get notifications |
| POST | `/api/v1/notifications/read` | Yes | Mark as read |

---

## 14. Integration Flows

### Flow 1: Guest Browsing & Preview
1. `GET /homepage?limit=10` — Load home screen with capped homepage lists
2. *(Optional, lazy loading)* `GET /homepage/:section?limit=10` — Load section-wise blocks
3. `GET /categories` — Category filters
4. `GET /books` — Book listing
5. `GET /books/:id` — Book details
6. `GET /access/preview-eligibility` — Check preview
7. `POST /content/audio-url` — Preview audio track

### Flow 2: Authentication
1. `POST /auth/signup` → Verify email
2. `POST /auth/login` → Store tokens securely
3. `GET /profile` → Load user data
4. `PATCH /profile` → Update profile
5. `POST /auth/logout` → Clear tokens

### Flow 3: Token Refresh
On receiving HTTP 401:
1. `POST /auth/refresh` with stored `refresh_token` → Get new tokens
2. Retry original request once
3. If refresh also returns 401 → Redirect to login

### Flow 4: Purchase & Payment
1. `POST /orders` → Create order
2. `GET /orders/:id` → Get order details
3. `POST /payments/initiate` → Get SSLCommerz URL
4. Open WebView with `gateway_url`
5. Handle callback redirect
6. `GET /library/purchases` → Verify purchase

### Flow 5: Coin Unlock
1. `GET /wallet` → Check balance
2. `GET /coin-packages` → Show packages
3. `GET /books/:id` → Get `coin_price` from format
4. `POST /wallet/unlock` → Unlock content
5. `POST /content/ebook-url` or `POST /content/audio-url` → Access

### Flow 6: Reading Session
1. `POST /access/check` → Verify access
2. `POST /content/ebook-url` → Get signed URL
3. Open PDF/EPUB viewer
4. `PUT /progress/reading` → Save progress periodically
5. `GET /progress/reading` → Resume reading

### Flow 7: Listening Session
1. `GET /books/:id/tracks` → Get track list
2. `POST /access/check` → Verify access
3. `POST /content/batch-audio-urls` → Get all track URLs
4. Play audio
5. `PUT /progress/listening` → Save progress periodically
6. `GET /progress/listening` → Resume listening

---

## 15. Flutter Notes

- Store `access_token` and `refresh_token` securely (`flutter_secure_storage`)
- Send `Authorization: Bearer <accessToken>` for protected endpoints
- If a protected request returns `401`, call `POST /auth/refresh` and retry once
- Signed URLs from `/content/*` expire in **5 minutes** — request fresh URLs as needed
- Audio preview duration is enforced **client-side**: use `preview_percentage` from `/access/preview-eligibility` to calculate cutoff
- All prices are in **BDT (Bangladeshi Taka)**
- All image URLs (`cover_url`, `avatar_url`, `logo_url`) are absolute URLs — load directly with `CachedNetworkImage`
- Pagination uses cursor-based paging for books/orders; `nextCursor` is the ID of the last item. Pass as `cursor` in next request; `null` means end of list
