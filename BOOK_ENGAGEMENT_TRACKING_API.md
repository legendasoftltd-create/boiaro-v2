# Book Engagement Tracking API (View / Read / Listen)

Reference for the mobile app on how **View Count**, **Read Count**, and
**Listen Count** are recorded for a book. All three are counted **once per
unique user** — never inflated by repeat opens/clicks. Read this fully
before wiring up the reader/player screens; getting the client-side session
tracking wrong will produce an inaccurate Read Count.

Base URL: `https://api.boiaro.com/api/v1` (see [REST_API.md](REST_API.md) for
auth headers, error envelope, etc. — this doc only covers the three
engagement endpoints and the rules behind them).

---

## Summary of rules

| Metric | Identity | Uniqueness window | Trigger |
| :--- | :--- | :--- | :--- |
| **View** | user_id (logged in) or device_id (anonymous) | 24 hours | Book Details / entry screen opens |
| **Read** | user_id only (reader requires login) | Lifetime, once ever | ≥60s in-session reading OR ≥3 pages advanced this session |
| **Listen** | user_id only | Lifetime, once ever | ≥60s playback position OR ≥30% of total duration |

All three are **idempotent on the server** — call the endpoints as often as
the flow below shows; duplicate calls within the dedup window are safe
no-ops. You do not need to build your own client-side "only send once"
guard for correctness (a lightweight guard to avoid redundant network calls
is fine, but the server is the source of truth).

---

## 1. View Count — `POST /books/:id/read`

Call when the user opens a book's **Details/entry screen** (not the reader
itself). Auth optional.

```http
POST /api/v1/books/{book_id}/read
Authorization: Bearer <accessToken>   // omit for anonymous
Content-Type: application/json

{ "device_id": "anonymous-device-uuid" }
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| device_id | string | Only when unauthenticated | A stable per-install identifier (see below) |

**Response (200):** `{ "success": true }`

- If the request has a valid `Authorization` token, the view is attributed
  to that `user_id` — `device_id` in the body is ignored.
- If there's no token, `device_id` is required to dedup the view; omit it
  and the call is a no-op (nothing recorded).
- Counted at most once per 24h per identity — call this every time the
  screen opens, no client debounce needed.

**device_id**: use a UUID generated once and persisted for the life of the
app install (e.g. stored in secure/local storage). This is the same kind of
identifier already used for device-session/multi-device-login tracking —
reuse that value if your app already generates one, rather than minting a
second one.

---

## 2. Read Count — `PUT /progress/reading`

🔒 Auth required (the reader screen requires login). Call this periodically
while the reader is open — it both saves resume-position and (once the
engagement threshold is crossed) records the Read.

```http
PUT /api/v1/progress/reading
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "book_id": "uuid",
  "current_page": 12,
  "total_pages": 320,
  "session_seconds": 75,
  "session_pages_read": 4
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| book_id | uuid | ✅ | |
| current_page | int | ✅ | Absolute current page |
| total_pages | int | ✅ | |
| session_seconds | number | ❌ | Seconds elapsed **since the reader opened for this book, this session** |
| session_pages_read | number | ❌ | Pages advanced **since the reader opened for this book, this session** |

**Response (200):** the saved `ReadingProgress` row.

### Client-side session tracking (required for Read Count to work)

`session_seconds`/`session_pages_read` are session-scoped, not lifetime
totals — track them per reader-open:

```dart
// Pseudocode — reset both when the reader opens for a (possibly new) book
DateTime sessionStart = DateTime.now();
int? sessionStartPage; // set on first progress save

void onProgressTick(int currentPage, int totalPages) {
  sessionStartPage ??= currentPage;
  final sessionSeconds = DateTime.now().difference(sessionStart).inSeconds;
  final sessionPagesRead = (currentPage - sessionStartPage!).abs();

  api.putReadingProgress(
    bookId: bookId,
    currentPage: currentPage,
    totalPages: totalPages,
    sessionSeconds: sessionSeconds,
    sessionPagesRead: sessionPagesRead,
  );
}
```

Call this on every page turn or on a short debounce (e.g. every 2s while
active) — once `session_seconds >= 60` or `session_pages_read >= 3`, the
server records the read (once, ever, for that user+book — later sessions
just keep saving progress with no further effect on the count).

**Do not** call this from a "Read Now" button handler with hardcoded/zero
values just to mark a book as read — the count only means something if
these fields reflect real engagement.

---

## 3. Listen Count — `PUT /progress/listening`

🔒 Auth required. Unchanged from existing behavior — included here for
completeness since it's the reference the Read Count logic mirrors.

```http
PUT /api/v1/progress/listening
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "book_id": "uuid",
  "track_number": 2,
  "position_seconds": 65,
  "total_seconds": 945
}
```

Call this periodically during playback (e.g. every 10-15s, or on
pause/seek/track-change). Once `position_seconds >= 60` or
`position_seconds / total_seconds >= 30%`, the server records the listen —
once, ever, per user+book.

---

## Full flows

**Reading:**
1. `POST /books/:id/read` — details screen opens (View)
2. `POST /access/check`, `POST /content/ebook-url` — verify access, get signed URL
3. Open reader, start session timer + starting-page marker
4. `PUT /progress/reading` on each page turn / debounce tick, with `session_seconds`/`session_pages_read` (Read, once threshold crossed)

**Listening:**
1. `GET /books/:id/tracks`, `POST /access/check`, `POST /content/batch-audio-urls`
2. Play audio
3. `PUT /progress/listening` periodically during playback (Listen, once threshold crossed)
