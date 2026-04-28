Here is the content of the PDF converted to Markdown format.

```markdown
# BoiAro REST API — Complete Documentation v2

## Flutter Integration Reference

**Version:** 2.0
**Date:** 2026-04-05
**Base URL:** `https://kxpqejmjfnzhqcefyuved.supabase.co/functions/vi/mobile-api`

## Global Rules

### Required Headers (every request)

| Header | Value |
| :--- | :--- |
| `apiKey` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpC3MiOiJzdXBhYmFzZSI5InJ1ZIi6Imt4cHFlamlqZm56aHFjZWZ5dWvK1iwicm9s` |
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <access token>` |

### Response Envelope

All responses are JSON. Success responses vary per endpoint. Error responses always follow:

```json
{
  "error": "Error message description"
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
| 422 | Validation error (e.g. weak password) |
| 500 | Internal server error |

### Pagination Convention

Pagination endpoints accept:

- `limit` (int, default 20, max 50)
- `offset` (int, default 0)

And return `total` (int or null) alongside the data array.

---

## 1. Authentication

### `POST /auth/signup`

Create a new user account. Email verification is required before login.

| Field | Details |
| :--- | :--- |
| Auth required | No |
| Path params | None |
| Query params | None |

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
| email | string | ☑ | User email address |
| password | string | ☑ | Min 6 characters |
| display_name | string | × | User display name |

**Success (201):**
```json
{
  "message": "Signup successful. Please verify your email."
}
```

**Error (400):**
```json
{
  "error": "Missing required fields"
}
```

**Error (422):**
```json
{
  "error": "Password must be at least 6 characters"
}
```

---

### `POST /auth/login`

Sign in with email/password. Returns JWT tokens.

| Field | Details |
| :--- | :--- |
| Auth required | No |

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "userpassword"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| email | string | ☑ | Registered email |
| password | string | ☑ | Account password |

**Success (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600,
  "user_id": "uuid",
  "user": {
    "email": "user@example.com"
  }
}
```

| Response field | Type | Description |
| :--- | :--- | :--- |
| access_token | string | JWT for Authorization header, expires in expires_in seconds |
| refresh_token | string | Use with /auth/refresh to get a new access token |
| expires_in | int | Token lifetime in seconds (typically 3600) |
| user_id | uuid | User's unique ID |
| user.email | string | User's email |

**Error (401):**
```json
{
  "error": "Invalid login credentials"
}
```

**Error (403):**
```json
{
  "error": "Email not verified"
}
```

---

### `POST /auth/refresh`

Refresh an expired access token using the refresh token.

| Field | Details |
| :--- | :--- |
| Auth required | No |

**Request body:**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| refresh_token | string | ☑ |

**Success (200):**
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",
  "expires_in": 3600
}
```

**Error (401):**
```json
{
  "error": "Invalid or expired refresh token"
}
```

---

### `POST /auth/logout`

Server-side logout acknowledgment. Client should discard tokens.

| Field | Details |
| :--- | :--- |
| Auth required | Yes |

**Request body:** None (empty)

**Success (200):**
```json
{
  "message": "Logged out successfully"
}
```

---

### `POST /auth/reset-password`

Send a password reset email.

| Field | Details |
| :--- | :--- |
| Auth required | No |

**Request body:**

```json
{
  "email": "user@example.com"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| email | string | ☑ |

**Success (200):**
```json
{
  "message": "Password reset email sent"
}
```

---

### `POST /auth/update-password`

Set a new password for the currently authenticated user.

| Field | Details |
| :--- | :--- |
| Auth required | ☑ Yes |

**Request body:**

```json
{
  "password": "new_secure_password"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| password | string | ☑ |

**Success (200):**
```json
{
  "message": "Password updated successfully"
}
```

**Error (422):**
```json
{
  "error": "Password must be at least 6 characters"
}
```

---

## 2. User Profile

### `GET /profile`

Get the current user's profile.

| Field | Details |
| :--- | :--- |
| Auth required | Yes |
| Query params | None |

**Success (200):**
```json
{
  "user_id": "uuid",
  "display_name": "John Doe",
  "full_name": "John Michael Doe",
  "avatar_url": "https://...",
  "bio": "Book lover",
  "preferred_language": "bn",
  "referral_code": "ABC123",
  "created_at": "2026-01-01T00:00:00.000Z"
}
```

| Field | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| user_id | uuid | No | User's unique ID |
| display_name | string | Yes | Public display name |
| full_name | string | Yes | Full legal name |
| avatar_url | string | Yes | Profile picture URL |
| bio | string | Yes | User bio text |
| preferred_language | string | Yes | "bn" or "en" |
| referral_code | string | Yes | User's referral code |
| created_at | ISO 8601 | No | Account creation time |

**Error (404):**
```json
{
  "error": "Profile not found"
}
```

---

### `PATCH /profile`

Update profile fields. Only send fields you want to change.

| Field | Details |
| :--- | :--- |
| Auth required | Yes |

**Allowed fields:**

| Field | Type | Description |
| :--- | :--- | :--- |
| display_name | string | Public display name |
| full_name | string | Full name |
| avatar_url | string | Profile picture URL |
| bio | string | Bio text |
| preferred_language | string | "bn" or "en" |

**Request body:**

```json
{
  "display_name": "New Name",
  "bio": "Updated bio"
}
```

**Success (200):**
```json
{
  "user_id": "uuid",
  "display_name": "New Name",
  "bio": "Updated bio"
}
```

---

### `GET /profile/roles`

Get the authenticated user's assigned roles.

| Field | Details |
| :--- | :--- |
| Auth required | Yes |

**Success (200):**
```json
{
  "roles": ["user", "premium"]
}
```

---

## 3. Books & Content Discovery

### `GET /books`

List books with pagination and optional filters. No auth required.

**Query params:**

| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| limit | int | 20 | Results per page (max 50) |
| offset | int | 0 | Pagination offset |
| category_id | uuid | — | Filter by category |
| featured | "true" | — | Featured books only |
| free | "true" | — | Free books only |
| q | string | — | Search by title (Bangla or English) |

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
      "rating": 4.5,
      "total_reads": 1200,
      "is_free": false,
      "is_featured": true,
      "is_bestseller": true,
      "is_new": false,
      "is_premium": true,
      "language": "Bangla",
      "published_date": "2025-06-15",
      "authors": {
        "id": "uuid",
        "name": "Author Name",
        "avatar_url": "https://..."
      },
      "categories": {
        "id": "uuid",
        "name": "Category Name",
        "name_en": "Category EN"
      }
    }
  ],
  "total": 100,
  "limit": 20,
  "offset": 0
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| books | array | Array of book objects |
| total | int/null | Total matching books (for pagination) |
| limit | int | Applied limit |
| offset | int | Applied offset |

**Each book object:**

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Book unique ID |
| title | string | Bangla title |
| title_en | string/null | English title |
| slug | string | URL-friendly slug |
| cover_url | string/null | Cover image URL |
| rating | float/null | Average rating (0–5) |
| total_reads | int/null | Total read count |
| is_free | bool | Whether the book is free |
| is_featured | bool | Featured flag |
| is_bestseller | bool | Bestseller flag |
| is_new | bool | Recently published |
| is_premium | bool | Premium content flag |
| language | string | Book language |
| published_date | string/null | Publication date |
| authors | object/null | Nested author {id, name, avatar_url} |
| categories | object/null | Nested category {id, name, name_en} |

---

### `GET /books/{id_or_slug}`

Get full book details including all available formats. No auth required.

| Field | Details |
| :--- | :--- |
| Path params | id_or_slug — UUID or slug string |

**Success (200):**
```json
{
  "id": "b1234567-89ab-cdef-0123-456789abcdef",
  "title": "চাঁদের পাহাড়",
  "title_en": "Chander Pahar",
  "slug": "chander-pahar",
  "description": "A classic adventure novel...",
  "description_bn": "বাংলা বিবরণ...",
  "cover_url": "https://...",
  "rating": 4.5,
  "reviews_count": 15,
  "total_reads": 1200,
  "is_free": false,
  "is_featured": true,
  "is_bestseller": true,
  "is_new": false,
  "is_premium": true,
  "language": "Bangla",
  "published_date": "2025-06-15",
  "tags": ["adventure", "classic", "bangla"],
  "coin_price": 50,
  "submission_status": "approved",
  "created_at": "2026-01-10T08:00:00.000Z",
  "authors": [
    {
      "id": "auth-uid",
      "name": "বিভূতিভূষণ বন্দ্যোপাধ্যায়",
      "name_en": "Bibhutibhushan Bandyopadhyay",
      "avatar_url": "https://...",
      "bio": "Author biography..."
    }
  ],
  "categories": [
    {
      "id": "cat-uid",
      "name": "উপন্যাস",
      "name_en": "Novel",
      "icon": "BookOpen",
      "color": "from-amber-50 to-orange-50"
    }
  ],
  "formats": [
    {
      "id": "fmt-uid-1",
      "format": "ebook",
      "price": 90,
      "original_price": 120,
      "discount": 25,
      "coin_price": 50,
      "duration": null,
      "pages": 320,
      "file_size": "2.5 MB",
      "in_stock": null,
      "stock_count": null,
      "is_available": true,
      "preview_percentage": 15,
      "preview_chapters": 2,
      "narrator_id": null,
      "narrators": null
    },
    {
      "id": "fmt-uid-2",
      "format": "audiobook",
      "price": 150,
      "original_price": null,
      "discount": null,
      "coin_price": 80,
      "duration": "5:30:00",
      "pages": null,
      "file_size": null,
      "in_stock": null,
      "stock_count": null,
      "is_available": true,
      "preview_percentage": 5,
      "preview_chapters": null,
      "narrator_id": "narr-uid",
      "narrators": {
        "id": "narr-uid",
        "name": "Narrator Name",
        "avatar_url": "https://..."
      }
    },
    {
      "id": "fmt-uuid-3",
      "format": "hardcopy",
      "price": 350,
      "original_price": 450,
      "discount": 22,
      "coin_price": null,
      "duration": null,
      "pages": 320,
      "file_size": null,
      "in_stock": true,
      "stock_count": 45,
      "is_available": true,
      "preview_percentage": null,
      "preview_chapters": null,
      "narrator_id": null,
      "narrators": null
    }
  ]
}
```

**Format object fields:**

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Format record ID |
| format | string | "ebook", "audiobook", or "hardcopy" |
| price | float/null | Price in BDT |
| original_price | float/null | Original price before discount |
| discount | float/null | Discount percentage |
| coin_price | int/null | Price in coins (for coin unlock) |
| duration | string/null | Audiobook duration (HH:MM:SS) |
| pages | int/null | Page count for ebook/hardcopy |
| file_size | string/null | File size string |
| in_stock | bool/null | Hardcopy stock status |
| stock_count | int/null | Available stock quantity |
| is_available | bool | Whether this format is active |
| preview_percentage | int/null | Preview % allowed (e.g. 15 = 15%) |
| preview_chapters | int/null | Number of free preview chapters |
| narrator_id | uuid/null | Narrator ID (audiobook only) |
| narrators | object/null | Nested {id, name, avatar_url} |

**Error (404):**
```json
{
  "error": "Book not found"
}
```

---

### `GET /categories`

List all active categories. No auth required.

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

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Category ID |
| name | string | Primary name |
| name_bn | string/null | Bangla name |
| name_en | string/null | English name |
| icon | string/null | Lucide icon name |
| color | string/null | Tailwind gradient classes |
| slug | string/null | URL slug |
| is_featured | bool | Featured on homepage |
| is_trending | bool | Currently trending |
| priority | int | Sort order (lower = first) |

---

### `GET /authors`

List authors with pagination. No auth required.

**Query params:**

| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| limit | int | 20 | Max 50 |
| offset | int | 0 | Pagination offset |

**Success (200):**
```json
{
  "authors": [
    {
      "id": "auth-uuid",
      "name": "বিভূতিভূষণ বন্দ্যোপাধ্যায়",
      "name_en": "Bibhutibhushan Bandyopadhyay",
      "avatar_url": "https://...",
      "bio": "Author biography...",
      "genre": "Adventure, Fiction",
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

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Author ID |
| name | string | Bangla name |
| name_en | string/null | English name |
| avatar_url | string/null | Photo URL |
| bio | string/null | Biography text |
| genre | string/null | Genre specialization |
| is_featured | bool | Featured author |
| is_trending | bool | Currently trending |
| priority | int | Sort order |

---

### `GET /authors/{id}`

Get a single author's details. No auth required.

| Field | Details |
| :--- | :--- |
| Path params | id - author UUID |

**Success (200):**
```json
{
  "id": "auth-uuid",
  "name": "বিভূতিভূষণ বন্দ্যোপাধ্যায়",
  "name_en": "Bibhutibhushan Bandyopadhyay",
  "avatar_url": "https://...",
  "bio": "Author biography...",
  "genre": "Adventure, Fiction",
  "is_featured": true,
  "is_trending": false
}
```

**Error (404):**
```json
{
  "error": "Author not found"
}
```

---

### `GET /narrators`

List all active narrators. No auth required.

**Success (200):**
```json
{
  "narrators": [
    {
      "id": "uuid",
      "name": "ন্যারেটরের নাম",
      "name_en": "Narrator Name",
      "avatar_url": "https://...",
      "bio": "Narrator biography",
      "specialty": "Fiction",
      "rating": 4.8,
      "is_featured": true,
      "is_trending": false
    }
  ]
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Narrator ID |
| name | string | Bangla name |
| name_en | string/null | English name |
| avatar_url | string/null | Photo URL |
| bio | string/null | Biography |
| specialty | string/null | Genre specialty |
| rating | float/null | Average rating (0-5) |
| is_featured | bool | Featured narrator |
| is_trending | bool | Trending |

---

### `GET /publishers`

List all active publishers. No auth required.

**Success (200):**
```json
{
  "publishers": [
    {
      "id": "pub-uuid",
      "name": "আনন্দ পাবলিশার্স",
      "name_en": "Ananda Publishers",
      "logo_url": "https://...",
      "description": "বাংলা ভাষার অন্যতম শীর্ষ প্রকাশনা সংস্থা...",
      "is_verified": true,
      "is_featured": true
    }
  ]
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Publisher ID |
| name | string | Bangla name |
| name_en | string/null | English name |
| logo_url | string/null | Logo URL |
| description | string/null | Description |
| is_verified | bool | Verified publisher |
| is_featured | bool | Featured |

---

### `GET /search`

Search books by title. No auth required.

**Query params:**

| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| q | string | ✅ | Search query, min 2 characters |

**Success (200):**
```json
{
  "results": [
    {
      "id": "book-uuid",
      "title": "চাঁদের পাহাড়",
      "title_en": "Chander Pahar",
      "slug": "chander-pahar",
      "cover_url": "https://...",
      "rating": 4.5,
      "is_free": false,
      "authors": {
        "name": "বিভূতিভূষণ বন্দ্যোপাধ্যায়"
      }
    }
  ]
}
```

**Error (400):**
```json
{
  "error": "Search query must be at least 2 characters"
}
```

---

### `GET /homepage`

Fetch all homepage sections in a single call. No auth required. Recommended for the app home screen.

**Success (200):**
```json
{
  "trending": [...],
  "featured": [...],
  "new_releases": [...],
  "recommended": [...]
}
```

Each section is an array of up to 10 books. Each book has: `id`, `title`, `slug`, `cover_url`, `rating`, `authors.name`. The trending section also includes `total_reads`.

---

## 4. Audiobook Tracks

### `GET /books/{book_id}/tracks`

List audiobook tracks for a book. No auth required.

| Field | Details |
| :--- | :--- |
| Path params | book_id — UUID |

**Success (200):**
```json
{
  "tracks": [
    {
      "id": "track-uuid-1",
      "track_number": 1,
      "title": "অধ্যায় ১ - শুরু",
      "duration": "12:30",
      "is_preview": true,
      "media_type": "audio",
      "chapter_price": null,
      "status": "active"
    },
    {
      "id": "track-uuid-2",
      "track_number": 2,
      "title": "অধ্যায় ২ - যাত্রা",
      "duration": "15:45",
      "is_preview": false,
      "media_type": "audio",
      "chapter_price": 10,
      "status": "active"
    }
  ]
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Track ID |
| track_number | int | Sequential track number |
| title | string | Chapter/track title |
| duration | string/null | Duration string (MM:SS or HH:MM:SS) |
| is_preview | bool | Whether marked as preview |
| media_type | string | "audio" or "video" |
| chapter_price | int/null | Per-chapter coin price |
| status | string | Track status |

Returns `{ "tracks": [] }` if no audiobook format exists.

---

## 5. Access Control

### `POST /access/check`

Check if user has access to a specific book format. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid",
  "format": "ebook"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ✅ | Book ID |
| format | string | ✅ | "ebook", "audiobook", or "hardcopy" |

**Success (200):**
```json
{
  "has_access": true,
  "access_method": "purchase"
}
```

Key fields:

| Field | Type | Description |
| :--- | :--- | :--- |
| has_access | bool | Whether user can access full content |
| access_method | string | How access was granted: "purchase", "subscription", "coin_unlock", "free", "none" |

---

### `GET /access/preview-eligibility`

Check preview availability for any book/format. No auth required. Use this to configure preview UI.

**Query params:**

| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | — | Required |
| format | string | "ebook" | "ebook" or "audiobook" |

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

| Field | Type | Description |
| :--- | :--- | :--- |
| is_free | bool | Book is completely free |
| preview_percentage | int | Percentage of content available as preview |
| preview_chapters | int | Number of free chapters |
| price | float | Price in BDT |
| guest_preview_allowed | bool | Always true — guests can preview |

---

## 6. Secure Content URLs

### `POST /content/ebook-url`

Get a time-limited signed URL for full ebook file access. 🔒 Auth required + purchase/unlock.

**Request body:**

```json
{
  "book_id": "book-uuid"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ☑ |

**Success (200):**
```json
{
  "signed_url": "https://...",
  "mime_type": "application/pdf",
  "expires_in": 300
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| signed_url | string | Time-limited download URL |
| mime_type | string | File MIME type |
| expires_in | int | URL validity in seconds |

**Error (401):**
```json
{
  "error": "Authentication required"
}
```

**Error (500):**
```json
{
  "error": "Failed to get secure URL"
}
```

---

### `POST /content/audio-url`

Get a signed URL for a specific audio track. Works for both guests (preview) and authenticated users (full access).

**Request body:**

```json
{
  "book_id": "book-uuid",
  "track_number": 1
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ☑ | Book ID |
| track_number | int | × | Track to fetch (default: 1) |

**Success (200):**
```json
{
  "signed_url": "https://...",
  "expires_in": 300
}
```

**Note:** Guest users receive the same URL but the Flutter app must enforce the preview duration limit client-side (using `preview_percentage` from `/access/preview-eligibility`).

---

### `POST /content/batch-audio-urls`

Get signed URLs for all tracks at once. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ☑ |

**Success (200):**
```json
{
  "tracks": [
    {
      "track_number": 1,
      "signed_url": "https://...",
      "expires_in": 300
    }
  ]
}
```

---

## 7. Reading & Listening Progress

### `GET /progress/reading`

Get reading progress for a specific book. 🔒 Auth required.

**Query params:**

| Param | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ☑ |

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
{
  "current_page": 0,
  "total_pages": 0,
  "percentage": 0,
  "last_read_at": null
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| current_page | int | Last read page number |
| total_pages | int | Total pages in the book |
| percentage | int | Read percentage (0–100) |
| last_read_at | ISO 8601 | Timestamp of last reading session |

---

### `PUT /progress/reading`

Save or update reading progress. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid",
  "current_page": 100,
  "total_pages": 320
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ☑ | Book ID |
| current_page | int | ☑ | Current page number |
| total_pages | int | ☑ | Total pages |

**Success (200):**
```json
{
  "message": "Reading progress saved"
}
```

---

### `GET /progress/listening`

Get listening progress for a specific audiobook. 🔒 Auth required.

**Query params:**

| Param | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ✓ |

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
{
  "current_track": 1,
  "position_seconds": 0,
  "total_seconds": 0,
  "last_listened_at": null
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| current_track | int | Current track number |
| position_seconds | int | Playback position in seconds within current track |
| total_seconds | int | Total duration in seconds of current track |
| last_listened_at | ISO 8601 | Last listening timestamp |

---

### `PUT /progress/listening`

Save or update listening progress. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid",
  "track_number": 2,
  "position_seconds": 45,
  "total_seconds": 945
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ☑ | Book ID |
| track_number | int | × | Current track (default: 1) |
| position_seconds | int | × | Playback position in seconds |
| total_seconds | int | × | Total track duration in seconds |

**Success (200):**
```json
{
  "message": "Listening progress saved"
}
```

---

## 8. Bookmarks

### `GET /bookmarks`

Get all bookmarked books. 🔒 Auth required.

**Success (200):**
```json
{
  "bookmarks": [
    {
      "book_id": "uuid",
      "books": {
        "id": "uuid",
        "title": "Book Title",
        "cover_url": "https://...",
        "slug": "book-slug",
        "authors": {
          "name": "Author Name"
        }
      },
      "created_at": "2026-04-05T10:00:00.000Z"
    }
  ]
}
```

---

### `POST /bookmarks`

Add a book to bookmarks. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| book_id | uuid | ☑ |

**Success (201):**
```json
{
  "message": "Bookmark added"
}
```

---

### `DELETE /bookmarks/{book_id}`

Remove a bookmark. 🔒 Auth required.

| Field | Details |
| :--- | :--- |
| Path params | book_id — UUID of the book |

**Success (200):**
```json
{
  "message": "Bookmark removed"
}
```

---

## 9. Reviews & Comments

### `GET /books/{book_id}/reviews`

Get book reviews. No auth required.

**Success (200):**
```json
{
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Great book!",
      "user_id": "uuid",
      "users": {
        "display_name": "John Doe",
        "avatar_url": "https://..."
      },
      "created_at": "2026-04-05T10:00:00.000Z"
    }
  ],
  "average_rating": 4.8,
  "total_reviews": 15
}
```

---

### `POST /reviews`

Submit a review/rating. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid",
  "rating": 5,
  "comment": "Excellent book"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ✓ | Book ID |
| rating | int | ✓ | Rating 1–5 |
| comment | string | × | Review text |

**Success (200):** Returns the review data from the database function.

---

### `GET /books/{book_id}/comments`

Get book comments (threaded). No auth required.

**Success (200):**
```json
{
  "comments": [
    {
      "id": "uuid",
      "comment": "Nice book",
      "parent_id": null,
      "user_id": "uuid",
      "users": {
        "display_name": "John Doe",
        "avatar_url": "https://..."
      },
      "replies": [
        {
          "id": "uuid",
          "comment": "I agree",
          "parent_id": "parent-uuid",
          "users": { ... }
        }
      ],
      "created_at": "2026-04-05T10:00:00.000Z"
    }
  ]
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| parent_id | uuid/null | null = top-level comment, uuid = reply to that comment |

---

### `POST /comments`

Post a comment or reply. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid",
  "comment": "Great read!",
  "parent_id": null
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ☑ | Book ID |
| comment | string | ☑ | Comment text |
| parent_id | uuid | × | Parent comment ID for replies |

**Success (201):**
```json
{
  "id": "uuid",
  "comment": "Great read!",
  "created_at": "2026-04-05T10:00:00.000Z"
}
```

---

## 10. Orders & Payments

### `POST /orders`

Create a new order. 🔒 Auth required.

**Request body:**

```json
{
  "items": [
    {
      "book_id": "book-uuid",
      "format": "ebook",
      "quantity": 1
    },
    {
      "book_id": "another-uuid",
      "format": "hardcopy",
      "quantity": 2
    }
  ],
  "shipping_address": {
    "name": "রহিম আহমেদ",
    "address": "৫৩ মিরপুর রোড, ঢাকা",
    "phone": "01712345678",
    "city": "Dhaka",
    "zip": "1216"
  },
  "payment_method": "online"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| items | array | ☑ | Array of items to order |
| items[].book_id | uuid | ☑ | Book ID |
| items[].format | string | ☑ | "ebook", "audiobook", or "hardcopy" |
| items[].quantity | int | × | Quantity (default: 1) |
| shipping_address | object | × | Shipping info (for hardcopy) |
| payment_method | string | × | "online" (default) or "cod" |

**Success (201):**
```json
{
  "id": "order-uuid",
  "order_number": "BOI-20260405-0001",
  "total_amount": 790,
  "status": "pending",
  "payment_method": "online",
  "created_at": "2026-04-05T10:00:00.000Z"
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Order ID |
| order_number | string | Human-readable order number |
| total_amount | float | Total in BDT |
| status | string | "pending", "awaiting payment", "confirmed", "paid", "processing", "shipped", "delivered", "completed", "cancelled", "payment failed" |
| payment_method | string | "online" or "cod" |
| created_at | ISO 8601 | Order creation time |

---

### `GET /orders/{order_id}`

Get full order details with items. 🔒 Auth required.

| Field | Details |
| :--- | :--- |
| Path params | order_id — UUID |

**Success (200):**
```json
{
  "id": "order-uuid",
  "order_number": "BOI-20260405-0001",
  "user_id": "user-uuid",
  "total_amount": 790,
  "status": "confirmed",
  "payment_method": "online",
  "shipping_name": "রহিম আহমেদ",
  "shipping_address": "৫৩ মিরপুর রোড, ঢাকা",
  "shipping_phone": "01712345678",
  "shipping_city": "Dhaka",
  "shipping_zip": "1216",
  "created_at": "2026-04-05T10:00:00.000Z",
  "updated_at": "2026-04-05T10:05:00.000Z",
  "order_items": [
    {
      "id": "item-uuid",
      "book_id": "book-uuid",
      "format": "ebook",
      "quantity": 1,
      "unit_price": 90,
      "total_price": 90,
      "books": {
        "id": "book-uuid",
        "title": "চাঁদের পাহাড়",
        "cover_url": "https://...",
        "slug": "chander-pahar"
      }
    }
  ]
}
```

**Error (404):**
```json
{
  "error": "Order not found"
}
```

---

### `POST /payments/initiate`

Initiate SSLCommerz payment for an order. 🔒 Auth required.

**Request body:**

```json
{
  "order_id": "order-uuid"
}
```

| Field | Type | Required |
| :--- | :--- | :--- |
| order_id | uuid | ✅ |

**Success (200):**
```json
{
  "success": true,
  "gateway_url": "https://securepay.sslcommerz.com/gprocess/v4?....",
  "session_key": "SSSession123..."
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| gateway_url | string | Redirect user to this URL to complete payment |
| session_key | string | SSLCommerz session key |

**Flutter integration:** Open `gateway_url` in a WebView. After payment, user is redirected back to the app's callback URL with `status=success|failed|cancelled&order_id=...`

**Error (500):**
```json
{
  "error": "Payment initiation failed"
}
```

---

### `POST /payments/demo`

Demo/test payment - instantly marks order as paid. 🔒 Auth required. Development only.

**Request body:**

```json
{
  "order_id": "order-uuid"
}
```

**Success (200):**
```json
{
  "message": "Payment completed (demo)"
}
```

---

## 11. Wallet & Coins

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

| Field | Type | Description |
| :--- | :--- | :--- |
| balance | int | Current coin balance |
| total_earned | int | Lifetime coins earned |
| total_spent | int | Lifetime coins spent |

---

### `GET /wallet/transactions`

Get coin transaction history. 🔒 Auth required.

**Query params:**

| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| limit | int | 50 | Max 100 |

**Success (200):**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "amount": 10,
      "type": "earn",
      "description": "Daily login reward",
      "source": "daily_reward",
      "created_at": "2026-04-05T10:00:00.000Z",
      "expires_at": null
    },
    {
      "id": "uuid",
      "amount": -50,
      "type": "spend",
      "description": "Unlocked ebook",
      "source": "content_unlock",
      "created_at": "2026-04-05T09:00:00.000Z",
      "expires_at": null
    }
  ]
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Transaction ID |
| amount | int | Positive = earned, Negative = spent |
| type | string | "earn" or "spend" |
| description | string | Human-readable description |
| source | string/null | Source: "daily_reward", "ad_reward", "content_unlock", "purchase", "referral", etc. |
| created_at | ISO 8601 | Transaction time |
| expires_at | ISO 8601/null | Coin expiry (null = never) |

---

### `POST /wallet/claim-daily`

Claim daily login reward coins. 🔒 Auth required.

**Request body:** None (empty)

**Success (200):** Returns reward data from the `claim_daily_login_reward` database function.
```json
{
  "reward": 10,
  "message": "Daily reward claimed",
  "new_balance": 260
}
```

---

### `POST /wallet/claim-ad`

Claim ad watch reward. 🔒 Auth required.

**Request body:**

```json
{
  "placement": "general"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| placement | string | × | Ad placement key (default: "general") |

**Success (200):** Returns reward data from the `claim_ad_reward` database function.
```json
{
  "reward": 5,
  "message": "Ad reward claimed",
  "new_balance": 265
}
```

---

### `POST /wallet/unlock`

Unlock content using coins. 🔒 Auth required.

**Request body:**

```json
{
  "book_id": "book-uuid",
  "format": "ebook",
  "coin_cost": 50
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ☑ | Book to unlock |
| format | string | ☑ | "ebook" or "audiobook" |
| coin_cost | int | ☑ | Coins to spend (from book format's coin_price) |

**Success (200):**
```json
{
  "success": true,
  "message": "Content unlocked",
  "new_balance": 150
}
```

**Already unlocked:**
```json
{
  "error": "Content already unlocked"
}
```

**Error (400):**
```json
{
  "error": "Insufficient coins"
}
```

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
    },
    {
      "id": "uuid",
      "coins": 500,
      "price": 449,
      "bonus_coins": 50,
      "is_popular": true,
      "is_best_value": false
    },
    {
      "id": "uuid",
      "coins": 1000,
      "price": 849,
      "bonus_coins": 150,
      "is_popular": false,
      "is_best_value": true
    }
  ]
}
```

---

## 12. Library

### `GET /library/purchases`

Get books purchased with money. 🔒 Auth required.

**Success (200):**
```json
{
  "items": [
    {
      "book_id": "book-uuid",
      "format": "ebook",
      "purchased_at": "2026-04-05T10:00:00.000Z",
      "books": {
        "id": "book-uuid",
        "title": "Book Title",
        "cover_url": "https://...",
        "slug": "book-slug",
        "authors": { "name": "Author Name" }
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
      "book_id": "book-uuid",
      "format": "ebook",
      "unlocked_at": "2026-04-05T10:00:00.000Z",
      "books": { ... }
    }
  ]
}
```

---

### `GET /library/continue-reading`

Get books with in-progress reading. 🔒 Auth required.

**Success (200):**
```json
{
  "items": [
    {
      "book_id": "book-uuid",
      "current_page": 78,
      "total_pages": 320,
      "percentage": 24,
      "last_read_at": "2026-04-05T12:30:00.000Z",
      "books": {
        "id": "book-uuid",
        "title": "Title",
        "cover_url": "https://...",
        "slug": "chander-pahar",
        "authors": { "name": "Author Name" }
      }
    }
  ]
}
```

Returns books where `0 < percentage < 100`, sorted by most recently read. Max 10 items.

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

## 13. Subscriptions

### `GET /subscriptions/plans`

List active subscription plans. No auth required.

**Success (200):**
```json
{
  "plans": [
    {
      "id": "plan-uid",
      "name": "মাসিক সাবস্ক্রিপশন",
      "description": "সীমাহীন বই পড়ুন",
      "price": 199,
      "duration_days": 30,
      "access_type": "all",
      "features": ["unlimited_ebooks", "unlimited_audiobooks", "no_ads"],
      "is_active": true
    }
  ]
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Plan ID |
| name | string | Plan name |
| description | string/null | Plan description |
| price | float | Price in BDT |
| duration_days | int | Subscription duration |
| access_type | string | Content access level |
| features | string[]/null | Feature list |
| is_active | bool | Plan availability |

---

### `GET /subscriptions/my`

Get current user's subscriptions. 🔒 Auth required.

**Success (200):**
```json
{
  "subscriptions": [
    {
      "id": "sub-uid",
      "plan_id": "plan-uid",
      "status": "active",
      "start_date": "2026-04-01",
      "end_date": "2026-05-01",
      "subscription_plans": {
        "name": "মাসিক সাবস্ক্রিপশন",
        "access_type": "all"
      }
    }
  ]
}
```

---

## 14. Notifications

### `GET /notifications`

Get user notifications. 🔒 Auth required. Returns most recent 50.

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

| Field | Type | Description |
| :--- | :--- | :--- |
| id | uuid | Notification ID |
| title | string | Notification title |
| message | string | Notification body |
| type | string | Type: "new_book", "order_update", "reward", "system", etc. |
| is_read | bool | Read status |
| created_at | ISO 8601 | Notification time |

---

### `POST /notifications/read`

Mark notifications as read. 🔒 Auth required.

**Request body:**

```json
{
  "ids": ["notification-id-1", "notification-id-2"]
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| ids | uuid[] | × | Specific notification IDs. If omitted/empty, marks ALL as read. |

**Mark all:**
```json
{}
```

**Success (200):**
```json
{
  "message": "Notifications marked as read"
}
```

---

## 15. Integration Flows

### Flow 1: Guest Browsing & Preview
1. Call `GET /homepage` to load the home screen
2. Call `GET /categories` for category filters
3. Call `GET /books` for book listing
4. Call `GET /books/{id}` for book details
5. Call `GET /access/preview-eligibility` to check preview availability
6. Call `POST /content/audio-url` for preview tracks (enforce duration client-side)

### Flow 2: Authentication & Profile
1. `POST /auth/signup` → Verify email (check email)
2. `POST /auth/login` → Store tokens securely
3. `GET /profile` → Load user data
4. `PATCH /profile` → Update profile
5. `POST /auth/logout` → Clear tokens

### Flow 3: Purchase & Payment
1. `POST /orders` → Create order with items
2. `GET /orders/{id}` → Get order details
3. `POST /payments/initiate` → Get SSLCommerz URL
4. Open WebView with `gateway_url`
5. Handle callback redirect to detect payment result
6. `GET /library/purchases` → Verify purchase in library

### Flow 4: Coin Purchase & Unlock
1. `GET /wallet` → Check current balance
2. `GET /coin-packages` → Show packages
3. (Purchase package via standard order/payment flow)
4. `GET /books/{id}` → Get book details with `coin_price`
5. `POST /wallet/unlock` → Unlock content
6. `POST /content/ebook-url` → Access content

### Flow 5: Reading Session
1. `POST /access/check` → Verify access
2. `POST /content/ebook-url` → Get signed URL
3. Open PDF viewer
4. `PUT /progress/reading` → Save progress periodically
5. `GET /progress/reading` → Resume reading

### Flow 6: Listening Session
1. `GET /books/{id}/tracks` → Get track list
2. `POST /access/check` → Verify access
3. `POST /content/batch-audio-urls` → Get all track URLs
4. Play audio in background
5. `PUT /progress/listening` → Save progress periodically
6. `GET /progress/listening` → Resume listening

---

## 16. Flutter Helper Class

```dart
class BoiAroApiClient {
  static const String baseUrl = 'https://kxpqejmjfnzhqcefyuved.supabase.co/functions/v1/mobile-api';
  static const String apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpC3MiOiJzdXBhYmFzZSI5InJ1ZIi6Imt4cHFlamlqZm56aHFjZWZ5dWvK1iwicm9s';

  String? accessToken;
  String? refreshToken;

  // Core HTTP methods
  Future<Map<String, dynamic>> _get(String path, [Map<String, dynamic>? params]) async {
    // Implementation
  }

  Future<Map<String, dynamic>> _post(String path, [Map<String, dynamic>? body]) async {
    // Implementation
  }

  Future<Map<String, dynamic>> _put(String path, [Map<String, dynamic>? body]) async {
    // Implementation
  }

  Future<Map<String, dynamic>> _patch(String path, [Map<String, dynamic>? body]) async {
    // Implementation
  }

  Future<Map<String, dynamic>> _delete(String path) async {
    // Implementation
  }

  // Auth
  Future<Map<String, dynamic>> signup(String email, String password, [String? displayName]) async {
    final data = await _post('auth/signup', {
      'email': email,
      'password': password,
      if (displayName != null) 'display_name': displayName,
    });
    return data;
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await _post('auth/login', {'email': email, 'password': password});
    if (data.containsKey('access_token')) {
      accessToken = data['access_token'];
      refreshToken = data['refresh_token'];
    }
    return data;
  }

  Future<Map<String, dynamic>> refresh() async {
    final data = await _post('auth/refresh', {'refresh_token': refreshToken});
    if (data.containsKey('access_token')) {
      accessToken = data['access_token'];
      refreshToken = data['refresh_token'];
    }
    return data;
  }

  Future<Map<String, dynamic>> logout() => _post('auth/logout');
  Future<Map<String, dynamic>> resetPassword(String email) => _post('auth/reset-password', {'email': email});

  // Profile
  Future<Map<String, dynamic>> getProfile() => _get('profile');
  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> updates) => _patch('profile', updates);
  Future<Map<String, dynamic>> getRoles() => _get('profile/roles');

  // Discovery
  Future<Map<String, dynamic>> getHomepage() => _get('homepage');
  Future<Map<String, dynamic>> getBooks({
    int limit = 20,
    int offset = 0,
    String? categoryId,
    bool? featured,
    bool? free,
    String? query,
  }) => _get('books', {
    'limit': limit,
    'offset': offset,
    if (categoryId != null) 'category_id': categoryId,
    if (featured == true) 'featured': 'true',
    if (free == true) 'free': 'true',
    if (query != null) 'q': query,
  });
  Future<Map<String, dynamic>> getBook(String idOrSlug) => _get('books/$idOrSlug');
  Future<Map<String, dynamic>> getCategories() => _get('categories');
  Future<Map<String, dynamic>> getAuthors({int limit = 20, int offset = 0}) => _get('authors', {'limit': limit, 'offset': offset});
  Future<Map<String, dynamic>> getAuthor(String id) => _get('authors/$id');
  Future<Map<String, dynamic>> getNarrators() => _get('narrators');
  Future<Map<String, dynamic>> getPublishers() => _get('publishers');
  Future<Map<String, dynamic>> search(String query) => _get('search', {'q': query});

  // Tracks
  Future<Map<String, dynamic>> getTracks(String bookId) => _get('books/$bookId/tracks');

  // Access
  Future<Map<String, dynamic>> checkAccess(String bookId, String format) => _post('access/check', {'book_id': bookId, 'format': format});
  Future<Map<String, dynamic>> previewEligibility(String bookId, [String format = 'ebook']) => _get('access/preview-eligibility', {'book_id': bookId, 'format': format});

  // Content URLs
  Future<Map<String, dynamic>> getEbookUrl(String bookId) => _post('content/ebook-url', {'book_id': bookId});
  Future<Map<String, dynamic>> getAudioUrl(String bookId, [int trackNumber = 1]) => _post('content/audio-url', {'book_id': bookId, 'track_number': trackNumber});
  Future<Map<String, dynamic>> getBatchAudioUrls(String bookId) => _post('content/batch-audio-urls', {'book_id': bookId});

  // Progress
  Future<Map<String, dynamic>> getReadingProgress(String bookId) => _get('progress/reading', {'book_id': bookId});
  Future<Map<String, dynamic>> saveReadingProgress(String bookId, int currentPage, int totalPages) => _put('progress/reading', {
    'book_id': bookId,
    'current_page': currentPage,
    'total_pages': totalPages,
  });
  Future<Map<String, dynamic>> getListeningProgress(String bookId) => _get('progress/listening', {'book_id': bookId});
  Future<Map<String, dynamic>> saveListeningProgress(String bookId, int track, int positionSec, int totalSec) => _put('progress/listening', {
    'book_id': bookId,
    'track_number': track,
    'position_seconds': positionSec,
    'total_seconds': totalSec,
  });

  // Bookmarks
  Future<Map<String, dynamic>> getBookmarks() => _get('bookmarks');
  Future<Map<String, dynamic>> addBookmark(String bookId) => _post('bookmarks', {'book_id': bookId});
  Future<Map<String, dynamic>> removeBookmark(String bookId) => _delete('bookmarks/$bookId');

  // Reviews & Comments
  Future<Map<String, dynamic>> getReviews(String bookId) => _get('books/$bookId/reviews');
  Future<Map<String, dynamic>> postReview(String bookId, int rating, [String? comment]) => _post('reviews', {
    'book_id': bookId,
    'rating': rating,
    if (comment != null) 'comment': comment,
  });
  Future<Map<String, dynamic>> getComments(String bookId) => _get('books/$bookId/comments');
  Future<Map<String, dynamic>> postComment(String bookId, String comment, [String? parentId]) => _post('comments', {
    'book_id': bookId,
    'comment': comment,
    if (parentId != null) 'parent_id': parentId,
  });

  // Orders
  Future<Map<String, dynamic>> createOrder(List<Map<String, dynamic>> items, [Map<String, dynamic>? shipping, String paymentMethod = 'online']) => _post('orders', {
    'items': items,
    if (shipping != null) 'shipping_address': shipping,
    'payment_method': paymentMethod,
  });
  Future<Map<String, dynamic>> getOrders() => _get('orders');
  Future<Map<String, dynamic>> getOrder(String orderId) => _get('orders/$orderId');
  Future<Map<String, dynamic>> initiatePayment(String orderId) => _post('payments/initiate', {'order_id': orderId});

  // Wallet
  Future<Map<String, dynamic>> getWallet() => _get('wallet');
  Future<Map<String, dynamic>> getTransactions([int limit = 50]) => _get('wallet/transactions', {'limit': limit});
  Future<Map<String, dynamic>> claimDaily() => _post('wallet/claim-daily');
  Future<Map<String, dynamic>> claimAd([String placement = 'general']) => _post('wallet/claim-ad', {'placement': placement});
  Future<Map<String, dynamic>> unlockContent(String bookId, String format, int coinCost) => _post('wallet/unlock', {
    'book_id': bookId,
    'format': format,
    'coin_cost': coinCost,
  });
  Future<Map<String, dynamic>> getCoinPackages() => _get('coin-packages');

  // Library
  Future<Map<String, dynamic>> getPurchases([String? format]) => _get('library/purchases', {if (format != null) 'format': format});
  Future<Map<String, dynamic>> getUnlocks() => _get('library/unlocks');
  Future<Map<String, dynamic>> getContinueReading() => _get('library/continue-reading');
  Future<Map<String, dynamic>> getContinueListening() => _get('library/continue-listening');

  // Subscriptions
  Future<Map<String, dynamic>> getPlans() => _get('subscriptions/plans');
  Future<Map<String, dynamic>> getMySubscriptions() => _get('subscriptions/my');

  // Notifications
  Future<Map<String, dynamic>> getNotifications() => _get('notifications');
  Future<Map<String, dynamic>> markRead([List<String>? ids]) => _post('notifications/read', {if (ids != null) 'ids': ids});
}
```

---

## 17. Important Notes for Flutter Developer

1. **Token Management:** Store `access_token` and `refresh_token` securely (e.g. `flutter_secure_storage`). Access tokens expire in ~1 hour. Call `/auth/refresh` proactively.

2. **Guest vs Auth:** Books, categories, authors, narrators, publishers, search, homepage, preview eligibility, audio preview URLs, coin packages, subscription plans, reviews, and comments all work without authentication.

3. **Preview Enforcement:** Audio preview duration is enforced client-side. Use `preview_percentage` from `/access/preview-eligibility` to calculate the cutoff time. Stop playback and show paywall when the user reaches the limit.

4. **apikey Header:** Include the `apikey` header in every request (both guest and authenticated).

5. **Pagination:** Use `limit` (max 50) and `offset`. Check `total` for calculating page count.

6. **Error Handling:** All errors return `{ "error": "message" }`. Check HTTP status code first, then parse the error message.

7. **Signed URLs Expire:** Content URLs from `/content/*` endpoints expire in ~5 minutes. Request new URLs as needed.

8. **No SDK Required:** This API is 100% standard REST. Any HTTP client works.

9. **Payment WebView:** For SSLCommerz, open `gateway_url` in a WebView. Handle the redirect callback URL to detect payment result.

10. **Image URLs:** `cover_url`, `avatar_url`, `logo_url` are full HTTPS URLs. Load them directly with `CachedNetworkImage` or similar.
```