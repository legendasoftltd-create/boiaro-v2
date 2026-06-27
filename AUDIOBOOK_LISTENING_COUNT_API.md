# Audiobook Listening Count — Full API Reference

A unique-listener count (🎧) for audiobooks, parallel to the existing 📖 Reads count for books. This document lists every API (tRPC and REST), database change, and frontend surface added for this feature.

Base URLs:
- tRPC: `{API_BASE}/trpc/{router}.{procedure}`
- REST: `{API_BASE}/api/v1/...`

---

## 1. Counting logic

A listen is counted **once per user per book**, the first time their audiobook playback crosses **60 seconds OR 30% of the current track's duration** (whichever happens first). Replays by the same user never increase the count again.

This is implemented in a single shared helper, `server/src/lib/listenTracking.ts`:

```ts
export async function maybeRecordListen(userId, bookId, positionSeconds, totalSeconds) {
  const percentage = totalSeconds > 0 ? (positionSeconds / totalSeconds) * 100 : 0;
  if (positionSeconds < 60 && percentage < 30) return;
  try {
    await prisma.bookListen.create({ data: { user_id: userId, book_id: bookId } });
    await prisma.book.update({ where: { id: bookId }, data: { total_listens: { increment: 1 } } });
  } catch (err) {
    if (err?.code !== "P2002") throw err; // already recorded for this user
  }
}
```

It's safe to call on **every** progress update (every ~15 seconds during playback, matching the existing player's save-progress interval) — the database's unique constraint on `(user_id, book_id)` makes the increment idempotent, so it's called unconditionally from both progress-saving endpoints below.

---

## 2. Database schema changes

| Change | Detail |
| :--- | :--- |
| New `BookListen` model | One row per **unique** `(user_id, book_id)` pair — enforced by a unique constraint, unlike `BookRead` which logs every read event with no dedup. |
| `Book.total_listens` | New nullable `Int` column, default `0`. Incremented once per unique listener, mirroring `Book.total_reads`. |

```prisma
model BookListen {
  id         String   @id @default(uuid())
  book_id    String
  created_at DateTime @default(now())
  user_id    String

  book Book @relation(fields: [book_id], references: [id], onDelete: Cascade)

  @@unique([user_id, book_id])
  @@map("book_listens")
}
```

Migration: `server/prisma/migrations/20260627140533_add_book_listens/migration.sql`

---

## 3. Updated tRPC procedures

| Procedure | What changed |
| :--- | :--- |
| `profiles.updateListeningProgress` | Now calls `maybeRecordListen(ctx.userId, input.bookId, input.currentPosition, input.totalDuration)` before upserting `ListeningProgress`, on every call. This is the web app's periodic (~15s) progress-save call — see `src/contexts/AudioPlayerContext.tsx`. |
| `books.narrators` | Each returned narrator now includes `totalListens: number` — the sum of `total_listens` across every approved audiobook they narrate (via `BookFormat.narrator_id`/`narrator_ids`). |
| `books.narratorById` | Same addition: response now includes `totalListens: number` alongside `books`. |

No new input/output shape changes beyond the added fields — existing consumers are unaffected.

### `Book.total_listens` is already in every existing book response

Because almost every book query (`books.detail`, `books.bySlug`, `books.browseBooks`, `books.list`, homepage feed, search, recommendations, bookmarks, etc.) uses Prisma's `include` rather than a narrowing `select` on the `Book` row itself, the new `total_listens` column is **automatically present** in all of those responses with zero procedure changes. The only places that needed an explicit code change are the ones listed above (narrator aggregation) and the few spots using an explicit `select` whitelist (the admin analytics query, listed below).

---

## 4. Updated REST endpoints (`/api/v1/...`)

| Endpoint | What changed |
| :--- | :--- |
| `PUT /progress/listening` | Now calls `maybeRecordListen(userId, book_id, position_seconds, total_seconds)` before upserting listening progress. **This is what the mobile app calls** to report audiobook playback — same trigger as the web app's tRPC mutation, so listens are counted identically on both platforms. |
| `GET /books/:id`, `GET /books/slug/:slug` | The live-stats helper (`computeLiveBookStats` in `books.service.ts`) now also returns `total_listens` (a real-time `BookListen` count), alongside the existing live `rating`/`reviews_count`/`total_reads`. |

### Request/response shapes (unchanged endpoints, new field only)

**`PUT /api/v1/progress/listening`** — request body (unchanged):
```json
{
  "book_id": "uuid",
  "track_number": 1,
  "position_seconds": 95,
  "total_seconds": 320,
  "playback_speed": 1.0
}
```
No response shape change — `{ "message": "Listening progress saved" }`. The listen-count side effect is silent (fire-and-forget on the server), by design — the client doesn't need to know whether this particular call was the one that crossed the threshold.

**`GET /api/v1/books/:id`** and **`GET /api/v1/books/slug/:slug`** — response now includes:
```json
{
  "...": "...",
  "total_reads": 120,
  "total_listens": 89
}
```

**`GET /api/v1/narrators`** and **`GET /api/v1/narrators/:id`** — response now includes:
```json
{
  "...": "...",
  "audiobooks_count": 4,
  "total_listens": 312
}
```
(`getAllNarrators`/`getNarratorById` in `server/src/services/narrators.service.ts`.)

---

## 5. Frontend surfaces

| Surface | File | What shows |
| :--- | :--- | :--- |
| Book Detail page hero | `src/components/book-detail/BookDetailHero.tsx` | `🎧 {totalListens} listens`, shown next to `📖 {totalReads} reads` — only rendered when the book has an audiobook format (an ebook-only book doesn't show a listens stat). |
| Audiobook tab | `src/components/book-detail/AudiobookTab.tsx` | `🎧 {totalListens} people listened`, in the narrator info row alongside duration and episode count. |
| Narrator public profile | `src/pages/NarratorProfile.tsx` | `🎧 {totalListens} listens` next to the rating stat — this page previously showed no listens/engagement stat at all. |

`src/lib/types.ts` — `MasterBook.totalListens: string` and `Narrator.totalListens: string` added (both pre-formatted strings, matching the existing `totalReads`/`listeners` convention). Populated in both book-transform functions: `src/hooks/useBooks.ts` (`trpcBookToMasterBook`, `useNarrators`) and `src/pages/BookDetail.tsx` (`buildMasterBook`).

> Note: `Narrator.listeners` (an existing, unrelated field) is actually mislabeled in the UI — it's wired up as a **follower** count (see `src/components/Narrators.tsx`, `title="Followers"`), not a listen count. `totalListens` is a new, separate field; nothing about the old `listeners` field was changed.

---

## 6. Admin Analytics

`admin.readingAnalyticsData` (consumed by `src/pages/admin/AdminReadingAnalytics.tsx`) now also returns:
- `books[].total_listens` (added to the existing `select`)
- `bookListens: { book_id, user_id, created_at }[]` — every `BookListen` row, mirroring the existing `bookReads` array

The admin Reading Analytics page has a new **"Top 10 Most Listened"** tab, mirroring the existing "Top 10 Most Read" tab exactly: a bar chart + table of the 10 audiobooks with the most unique listens, each row showing total listens and unique-listener count, with CSV export.

**Out of scope for this round** (flagging rather than silently building): the separate `weeklyReportData` admin procedure's "Top Books" widget (used by a different dashboard report, not the Reading Analytics page) still only reports reads, not listens. Extending that wasn't part of the requested "Book Detail, Audiobook List, Narrator Profile, Analytics" surfaces, so it was left as-is.

---

## 7. What was deliberately left out

- **No "live" optimistic listens counter** on the book detail page (unlike `liveReads`, which updates instantly via `useBookEngagement` when a user explicitly triggers a read). Listens accumulate server-side during background playback-progress polling, not a single explicit user action, so an instant local optimistic update isn't meaningful here — the count reflects the next data refresh.
- **Ebook reading is untouched.** This feature is audiobook-specific; `BookRead`/`total_reads` (ebook/general reads) and the reading-progress flow are unmodified.
