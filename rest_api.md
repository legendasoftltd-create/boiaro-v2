# Boiaro TTS REST API

AI Text-to-Speech API for mobile apps and third-party clients.

**Base URL (Production):** `https://api.boiaro.com/api/v1/tts`  
**Base URL (Development):** `http://localhost:3001/api/v1/tts`

All endpoints return JSON. Errors follow the shape `{ "error": "message" }`.

---

## Authentication

Protected endpoints require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <access_token>
```

Obtain `access_token` from `POST /api/v1/auth/login` or `POST /api/v1/auth/refresh`.  
Tokens expire after **15 minutes** — use the refresh token to get a new one.

---

## Available Voices

| Voice ID | Name | Label | Gender |
|---|---|---|---|
| `EXAVITQu4vr4xnSDxMaL` | Sarah | সারা (মহিলা) | Female |
| `pFZP5JQG7iQjIQuC4Bku` | Lily | লিলি (মহিলা) | Female |
| `JBFqnCBsd6RMkjVDRZzb` | George | জর্জ (পুরুষ) | Male |

Default voice is **Sarah** when `voice_id` is omitted.  
All voices use ElevenLabs `eleven_multilingual_v2` model with Bengali preprocessing.

---

## Access Control

Each book has a `voice_access_type` field that determines how users get TTS access:

| `voice_access_type` | What is required |
|---|---|
| `free` | No unlock needed — any authenticated user can generate |
| `paid` | One-time coin unlock via `POST /unlock` |
| `subscription` | Active platform subscription required |

Check access status before calling `/generate` using `GET /access/:bookId`.

---

## Endpoints

### 1. List Voices

```
GET /api/v1/tts/voices
```

Returns all available Bengali AI voices. No authentication required.

**Response `200`**
```json
{
  "voices": [
    {
      "id": "EXAVITQu4vr4xnSDxMaL",
      "name": "Sarah",
      "label": "সারা (মহিলা)",
      "lang": "bn"
    },
    {
      "id": "pFZP5JQG7iQjIQuC4Bku",
      "name": "Lily",
      "label": "লিলি (মহিলা)",
      "lang": "bn"
    },
    {
      "id": "JBFqnCBsd6RMkjVDRZzb",
      "name": "George",
      "label": "জর্জ (পুরুষ)",
      "lang": "bn"
    }
  ]
}
```

---

### 2. Check TTS Access

```
GET /api/v1/tts/access/:bookId
```

Check whether the authenticated user can use premium TTS on a specific book.  
Also returns the user's current coin balance so the UI can show how many coins are needed.

**Auth:** Required

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `bookId` | string | The book ID |

**Response `200` — Premium Voice not enabled for this book**
```json
{
  "premium_voice_enabled": false,
  "unlocked": false,
  "access_type": null,
  "coin_price": null,
  "message": "Premium Voice is not available for this book"
}
```

**Response `200` — Access granted (free or already unlocked)**
```json
{
  "premium_voice_enabled": true,
  "unlocked": true,
  "access_type": "free",
  "coin_price": 0,
  "wallet_balance": 150
}
```

**Response `200` — Access denied, coin unlock required**
```json
{
  "premium_voice_enabled": true,
  "unlocked": false,
  "access_type": "paid",
  "coin_price": 20,
  "wallet_balance": 5,
  "message": "Purchase required — unlock with coins to use AI Voice"
}
```

**Response `200` — Access denied, subscription required**
```json
{
  "premium_voice_enabled": true,
  "unlocked": false,
  "access_type": "subscription",
  "coin_price": 0,
  "wallet_balance": 150,
  "message": "Subscription required to use AI Voice"
}
```

**Response `404`**
```json
{ "error": "Book not found" }
```

---

### 3. Unlock Premium TTS with Coins

```
POST /api/v1/tts/unlock
Content-Type: application/json
```

Deduct coins from the user's wallet and create a permanent unlock for a book's premium TTS.  
Only applicable when `voice_access_type` is `"paid"`. For `"subscription"` books, the user must have an active subscription — no coin unlock is possible.

**Auth:** Required

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `book_id` | string | Yes | The book ID to unlock |

```json
{
  "book_id": "abc123xyz"
}
```

**Response `200` — Successfully unlocked**
```json
{
  "success": true,
  "message": "AI Voice unlocked successfully",
  "coins_spent": 20
}
```

**Response `200` — Already unlocked**
```json
{
  "success": true,
  "already_unlocked": true,
  "message": "Already unlocked"
}
```

**Response `200` — Free book, no unlock needed**
```json
{
  "success": true,
  "message": "Premium Voice is free for this book — no unlock needed"
}
```

**Response `400` — Insufficient coins**
```json
{
  "error": "Insufficient coin balance",
  "required": 20,
  "balance": 5
}
```

**Response `400` — Subscription book**
```json
{
  "error": "This book requires an active subscription, not a coin purchase"
}
```

**Response `400` — Premium Voice not enabled**
```json
{
  "error": "Premium Voice is not enabled for this book"
}
```

**Response `404`**
```json
{ "error": "Book not found" }
```

---

### 4. Generate Audio

```
POST /api/v1/tts/generate
Content-Type: application/json
```

Generate ElevenLabs AI audio for a single paragraph of text.  
If the exact same text was previously generated for the same book, the cached audio URL is returned instantly (no new API call to ElevenLabs).

**Auth:** Required  
**Access:** User must have TTS access for the book (free, coin-unlocked, or active subscription)

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `book_id` | string | Yes | The book ID |
| `text` | string | Yes | Paragraph text to synthesize. Max 3000 characters |
| `voice_id` | string | No | ElevenLabs voice ID. Defaults to Sarah (`EXAVITQu4vr4xnSDxMaL`) |
| `paragraph_index` | number | No | Index of the paragraph in the book (used for cache key). Default `0` |

```json
{
  "book_id": "abc123xyz",
  "text": "এটি একটি বাংলা অনুচ্ছেদ যা পড়া হবে।",
  "voice_id": "EXAVITQu4vr4xnSDxMaL",
  "paragraph_index": 0
}
```

**Response `200` — Audio ready**
```json
{
  "success": true,
  "audio_url": "https://api.boiaro.com/uploads/tts/abc123xyz_0_EXAVITQu4vr4xnSDxMaL.mp3",
  "voice_id": "EXAVITQu4vr4xnSDxMaL",
  "paragraph_index": 0
}
```

`audio_url` is always an absolute URL. If storage is backed by S3, it will be an S3 URL. If local, it will be `https://api.boiaro.com/uploads/tts/...`.  
Stream or download this URL directly to play the audio in the app.

**Response `403` — No access**
```json
{
  "error": "Purchase required — unlock with coins to use AI Voice",
  "access_type": "paid",
  "coin_price": 20
}
```

**Response `429` — ElevenLabs quota exceeded**
```json
{
  "error": "ElevenLabs quota exceeded. Please try again later.",
  "quota_exceeded": true
}
```

**Response `400` — Validation**
```json
{ "error": "text must be 3000 characters or fewer" }
```

---

### 5. Check Cache Status

```
GET /api/v1/tts/cache/:bookId
```

Returns how many audio segments are cached for a book and when the latest was generated.  
Useful for preflight UI checks (e.g. showing a "cached" badge or skipping the loading spinner).

**Auth:** Optional

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `bookId` | string | The book ID |

**Response `200` — Cache exists**
```json
{
  "has_cache": true,
  "segment_count": 42,
  "latest_at": "2026-05-06T08:30:00.000Z",
  "voice_id": "EXAVITQu4vr4xnSDxMaL"
}
```

**Response `200` — No cache**
```json
{
  "has_cache": false,
  "segment_count": 0,
  "latest_at": null,
  "voice_id": null
}
```

---

## Error Reference

| HTTP Status | When |
|---|---|
| `400` | Bad request — missing/invalid fields, insufficient coins, wrong access type |
| `401` | Missing or invalid Bearer token |
| `403` | Authenticated but no TTS access for the book |
| `404` | Book not found |
| `429` | ElevenLabs monthly character quota exceeded |
| `500` | Internal server error |

---

## Recommended Mobile Flow

```
1. GET /api/v1/tts/access/:bookId
       │
       ├─ premium_voice_enabled: false  →  Use browser/device TTS only
       │
       ├─ unlocked: true                →  Skip to step 3
       │
       └─ unlocked: false
              │
              ├─ access_type: "paid"    →  Show coin purchase UI
              │       └─ POST /api/v1/tts/unlock  →  unlocked
              │
              └─ access_type: "subscription"  →  Show subscription paywall

2. (Optional) GET /api/v1/tts/cache/:bookId
       └─ has_cache: true  →  First paragraph loads instantly

3. For each paragraph the user reaches:
       POST /api/v1/tts/generate  { book_id, text, voice_id, paragraph_index }
       └─ Play audio_url
```

---

## Audio Caching

- Audio is cached by a **SHA-256 hash of the text** per book and voice.
- If the same paragraph is requested again (same text + same book), the cached file is returned without calling ElevenLabs.
- Cache is stored server-side — the client does not need to manage caching.
- The `paragraph_index` field is used for the filename only; two requests with the same `text` but different `paragraph_index` values return the same audio.

---

## Audio Format

| Property | Value |
|---|---|
| Format | MP3 |
| Bitrate | 128 kbps |
| Sample rate | 44,100 Hz |
| Model | `eleven_multilingual_v2` |
| Language | Bengali (`bn`) |
