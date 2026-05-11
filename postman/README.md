# Boiaro API — Postman Collections

Three Postman collections covering the TTS, Category, and Category Sections REST APIs.
All endpoints live under `/api/v1/`.

---

## How to Import

1. Open Postman → **Import** → choose a `.json` file from this directory.
2. Each collection ships with a **base_url** variable pre-set to `https://api.boiaro.com`.
   Change it in **Collection → Variables** to point at your local or staging server.
3. Set `access_token` to a valid JWT from the `/api/v1/auth/login` response before calling any authenticated endpoint.

---

## Authentication

Authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Obtain a token by calling `POST /api/v1/auth/login` with `{ "email": "...", "password": "..." }`.
The response contains `access_token` — copy it into the collection variable.

Public endpoints (marked **No auth**) work without any token.

---

## Common Response Shape

Every endpoint returns JSON with a top-level `success` flag:

```json
{ "success": true,  ... }   // 2xx — payload follows
{ "success": false, "error": "reason" }  // 4xx/5xx
```

---

---

# 1. TTS API

**File:** `TTS_API.postman_collection.json`
**Base path:** `/api/v1/tts`

Covers AI voice generation (ElevenLabs), ambient background tracks, coin-based unlocking, and audio caching.

---

## Endpoints at a Glance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/voices` | No | List enabled Bengali AI voices |
| GET | `/ambient-tracks` | No | List ambient background sound tracks |
| GET | `/access/:bookId` | Yes | Check if user can use TTS on a book |
| POST | `/unlock` | Yes | Spend coins to unlock premium TTS |
| POST | `/generate` | Yes | Generate (or retrieve cached) audio for a paragraph |
| POST | `/prefetch` | Yes | Background-prefetch up to 3 upcoming paragraphs |
| GET | `/cache/:bookId` | No | Check how many audio segments are cached |

---

## GET `/api/v1/tts/voices`

Returns all enabled Bengali AI voices. Voices are managed by the admin — the list can change.
Always call this at app startup and let the user choose a voice.

**Response:**
```json
{
  "success": true,
  "voices": [
    {
      "id": "EXAVITQu4vr4xnSDxMaL",
      "name": "Sarah",
      "label": "সারা (মহিলা)",
      "lang": "bn",
      "category": null
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | ElevenLabs voice ID — pass this as `voice_id` when generating audio |
| `name` | string | Internal English name |
| `label` | string | Display name in Bengali |
| `lang` | string | Always `"bn"` |
| `category` | string\|null | Optional grouping label (e.g. "female", "male") |

---

## GET `/api/v1/tts/ambient-tracks`

Returns enabled ambient background sound tracks. The `url` is a fully resolved absolute URL — play it directly.

**Response:**
```json
{
  "success": true,
  "tracks": [
    {
      "id": "calm",
      "name": "Calm",
      "label": "শান্ত",
      "emoji": "🌿",
      "url": "https://cdn.boiaro.com/ambient/calm.mp3"
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable identifier for the track |
| `label` | string | Bengali display name |
| `emoji` | string | Use as icon in UI |
| `url` | string | Absolute URL — stream or download directly |

---

## GET `/api/v1/tts/access/:bookId`

Check whether the logged-in user has TTS access for a book before showing the voice UI.
Use this to decide whether to show a "Unlock with Coins" button or allow playback directly.

**Headers:** `Authorization: Bearer <token>`

**Response variants:**

```json
// Premium voice is free for this book — allow playback
{
  "success": true,
  "premium_voice_enabled": true,
  "unlocked": true,
  "access_type": "free",
  "coin_price": 0,
  "wallet_balance": 150
}

// Book is locked — show unlock button
{
  "success": true,
  "premium_voice_enabled": true,
  "unlocked": false,
  "access_type": "paid",
  "coin_price": 50,
  "wallet_balance": 120,
  "message": "Purchase required — unlock with coins to use AI Voice"
}

// Book doesn't have TTS enabled — hide the voice feature entirely
{
  "success": true,
  "premium_voice_enabled": false,
  "unlocked": false,
  "access_type": null,
  "coin_price": null
}
```

| Field | Type | Notes |
|-------|------|-------|
| `premium_voice_enabled` | boolean | If `false`, hide TTS from the UI entirely |
| `unlocked` | boolean | If `true`, user can generate audio immediately |
| `access_type` | `"free"` \| `"paid"` \| `"subscription"` \| null | How access is granted |
| `coin_price` | number\|null | Coins required to unlock; 0 if free |
| `wallet_balance` | number | User's current coin balance |
| `message` | string | Only present when `unlocked` is `false` |

**Decision tree for UI:**
```
premium_voice_enabled = false  →  hide TTS
unlocked = true                →  show play button
unlocked = false, access_type = "paid"         →  show "Unlock for N coins"
unlocked = false, access_type = "subscription" →  show "Subscribe to use"
```

---

## POST `/api/v1/tts/unlock`

Spend coins to unlock TTS for a book. Call this when the user taps "Unlock".
After success, call `/access/:bookId` again to confirm, then enable playback.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{ "book_id": "a1b2c3d4-..." }
```

**Responses:**
```json
// Success
{ "success": true, "message": "AI Voice unlocked successfully", "coins_spent": 50 }

// Already unlocked (idempotent — safe to call again)
{ "success": true, "already_unlocked": true, "message": "Already unlocked" }

// Not enough coins
{ "success": false, "error": "Insufficient coin balance", "required": 50, "balance": 20 }
```

---

## POST `/api/v1/tts/generate`

Generate (or retrieve from cache) AI audio for a single paragraph of text.
If the same text + voice combination was generated before, the cached `audio_url` is returned instantly — no ElevenLabs call is made.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{
  "book_id": "a1b2c3d4-...",
  "text": "এটি একটি পরীক্ষামূলক অনুচ্ছেদ।",
  "voice_id": "EXAVITQu4vr4xnSDxMaL",
  "paragraph_index": 0
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `book_id` | Yes | UUID of the book being read |
| `text` | Yes | Bengali text to synthesize, max 3000 characters |
| `voice_id` | No | ElevenLabs voice ID from `/voices`. Defaults to first enabled voice |
| `paragraph_index` | No | 0-based page/paragraph position. Default `0`. Used for cache keying |

**Response:**
```json
{
  "success": true,
  "audio_url": "https://cdn.boiaro.com/tts/abc123.mp3",
  "voice_id": "EXAVITQu4vr4xnSDxMaL",
  "paragraph_index": 0
}
```

`audio_url` is an absolute URL — pass it directly to your audio player.

**Error cases:**

| HTTP | `error` | What to do |
|------|---------|------------|
| 400 | `text must be 3000 characters or fewer` | Truncate or split the text |
| 403 | `Purchase required…` | Show unlock screen |
| 429 | `ElevenLabs quota exceeded…` | Notify user, retry later; `quota_exceeded: true` is set |

---

## POST `/api/v1/tts/prefetch`

Silently pre-generate audio for the next few paragraphs while the user is listening to the current one.
The server responds immediately and generates audio in the background.
When the user reaches those paragraphs, `/generate` will return the cached URL instantly.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Body:**
```json
{
  "book_id": "a1b2c3d4-...",
  "voice_id": "EXAVITQu4vr4xnSDxMaL",
  "paragraphs": [
    { "text": "প্রথম অনুচ্ছেদ...", "index": 1 },
    { "text": "দ্বিতীয় অনুচ্ছেদ...", "index": 2 },
    { "text": "তৃতীয় অনুচ্ছেদ...", "index": 3 }
  ]
}
```

- Max **3 paragraphs** per call.
- `index` is the paragraph's position in the book (same value you pass to `/generate` as `paragraph_index`).

**Response:**
```json
{ "success": true, "queued": 3 }
```

**Recommended usage:** Call prefetch whenever the user starts listening to a paragraph — pass the next 2–3 paragraphs. This keeps playback smooth with no loading delay.

---

## GET `/api/v1/tts/cache/:bookId`

Check how many audio segments have been generated and cached for a book.
Use this to show a "pre-cached" indicator in the reader UI.

**Response:**
```json
{
  "success": true,
  "has_cache": true,
  "segment_count": 12,
  "latest_at": "2026-05-10T14:32:00.000Z",
  "voice_id": "EXAVITQu4vr4xnSDxMaL"
}
```

---

---

# 2. Category API

**File:** `Category_API.postman_collection.json`
**Base path:** `/api/v1/categories`

Fetch the book categories used for filtering and navigation. All public — no auth needed.

---

## Endpoints at a Glance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | List all active categories |
| GET | `/:id` | No | Get a single category by UUID or slug |

---

## GET `/api/v1/categories`

Returns all active categories ordered by admin-set priority (lowest number first).

**Response:**
```json
{
  "success": true,
  "categories": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "উপন্যাস",
      "name_bn": "উপন্যাস",
      "name_en": "Novel",
      "slug": "novel",
      "icon": "https://cdn.boiaro.com/uploads/categories/novel-icon.webp",
      "color": "#6366f1",
      "is_featured": true,
      "is_trending": false,
      "priority": 1,
      "book_count": 48
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | UUID — use this to filter books by category |
| `name_bn` | string\|null | Primary Bengali display name |
| `name_en` | string\|null | English name |
| `slug` | string\|null | URL-friendly identifier (e.g. `"novel"`) |
| `icon` | string\|null | Absolute URL to the category image/icon. May be `null` if not set |
| `color` | string\|null | Hex color for category card backgrounds |
| `is_featured` | boolean | Show in featured sections |
| `is_trending` | boolean | Show in trending sections |
| `priority` | number | Display order — lower = higher priority |
| `book_count` | number | Count of approved books in this category |

**To filter books by category:** `GET /api/v1/books?categoryId={id}`

---

## GET `/api/v1/categories/:id`

Fetch a single active category. Accepts either a UUID or a slug.

```
GET /api/v1/categories/a1b2c3d4-e5f6-7890-abcd-ef1234567890
GET /api/v1/categories/novel
```

**Response (found):**
```json
{
  "success": true,
  "category": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "উপন্যাস",
    "name_bn": "উপন্যাস",
    "name_en": "Novel",
    "slug": "novel",
    "icon": "https://cdn.boiaro.com/uploads/categories/novel-icon.webp",
    "color": "#6366f1",
    "is_featured": true,
    "is_trending": false,
    "priority": 1,
    "book_count": 48
  }
}
```

**Response (not found):** `404`
```json
{ "success": false, "error": "Category not found" }
```

---

---

# 3. Category Sections API

**File:** `CategorySections_API.postman_collection.json`
**Base path:** `/api/v1/category-sections`

Returns the homepage sections that are configured by the admin — each one is a category
with a curated list of its latest approved books. Use this to render the homepage directly
without any client-side filtering logic.

---

## Endpoints at a Glance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | List all homepage category sections with books |

---

## GET `/api/v1/category-sections`

Returns all homepage sections in admin-defined display order.
Each section embeds its category details and the latest `book_limit` approved books.

**Response:**
```json
{
  "success": true,
  "sections": [
    {
      "id": "sec-uuid-001",
      "title": "Popular Novels",
      "subtitle": "Top picks this month",
      "category_id": "a1b2c3d4-...",
      "sort_order": 1,
      "book_limit": 8,
      "category": {
        "id": "a1b2c3d4-...",
        "name": "উপন্যাস",
        "name_bn": "উপন্যাস",
        "name_en": "Novel",
        "slug": "novel",
        "icon": "https://cdn.boiaro.com/uploads/categories/novel-icon.webp",
        "color": "#6366f1"
      },
      "books": [
        {
          "id": "book-uuid-001",
          "title": "রাত্রির যাত্রী",
          "title_en": "Night Traveller",
          "slug": "raatrir-jatri",
          "cover_url": "https://cdn.boiaro.com/uploads/covers/raatrir-jatri.webp",
          "rating": 4.7,
          "is_free": false,
          "author": {
            "id": "author-uuid-001",
            "name": "হুমায়ূন আহমেদ",
            "name_en": "Humayun Ahmed"
          },
          "formats": [
            { "format": "ebook",     "price": 99,  "is_available": true },
            { "format": "audiobook", "price": 149, "is_available": true }
          ]
        }
      ]
    }
  ]
}
```

### Section fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Section UUID |
| `title` | string\|null | Section heading set by admin |
| `subtitle` | string\|null | Optional subheading |
| `category_id` | string | UUID of the linked category — use for "View All" links |
| `sort_order` | number | Display order on homepage |
| `book_limit` | number | Max books returned in this section |
| `category` | object | Embedded category details (see Category API fields) |
| `books` | array | Latest approved books, ordered newest first |

### Book fields (inside `books`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Book UUID — use to fetch full book details |
| `title` | string | Bengali title |
| `title_en` | string\|null | English title |
| `slug` | string | URL-friendly identifier |
| `cover_url` | string\|null | Absolute URL to cover image — use directly in `<img>` |
| `rating` | number | Average rating (0–5) |
| `is_free` | boolean | If `true`, show a "Free" badge |
| `author.name` | string | Bengali author name |
| `author.name_en` | string\|null | English author name |
| `formats` | array | Available purchase formats |
| `formats[].format` | `"ebook"` \| `"audiobook"` \| `"hardcopy"` | Format type |
| `formats[].price` | number | Price in BDT; `0` if free |
| `formats[].is_available` | boolean | Whether this format can be purchased/read |

### "View All" link

To navigate to the full book list for a section's category:

```
/books?category={section.category_id}
```

Use `category_id` (UUID), not the category slug.

### Recommended homepage rendering

```
for each section in sections:
  render section header using section.title / section.subtitle
  render horizontal scroll row of section.books
  render "View All" button → /books?category={section.category_id}
```

---

---

## TTS Integration Guide for Reader Screen

This is the recommended call sequence when a user opens a book in the reader with TTS:

```
1. GET /api/v1/tts/voices
      → populate voice picker UI

2. GET /api/v1/tts/ambient-tracks
      → populate ambient sound picker UI

3. GET /api/v1/tts/access/{bookId}
      → premium_voice_enabled = false  →  hide TTS UI
      → unlocked = true                →  enable play button
      → unlocked = false               →  show unlock prompt (coin_price, wallet_balance)

4. [if locked] User taps "Unlock":
      POST /api/v1/tts/unlock   { book_id }
      → on success, re-fetch /access/{bookId} to confirm

5. User taps play on a paragraph:
      POST /api/v1/tts/generate   { book_id, text, voice_id, paragraph_index }
      → play audio_url

6. While audio plays, prefetch next paragraphs:
      POST /api/v1/tts/prefetch   { book_id, voice_id, paragraphs: [...next 2-3] }
      → server caches in background

7. User moves to next paragraph:
      POST /api/v1/tts/generate   (cache hit → instant response)
```
