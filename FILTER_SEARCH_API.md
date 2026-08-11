# Filter & Search API Changes

This document covers every mobile/Flutter REST endpoint (`/api/v1/*`) that gained or already
had format-filter (`ebook` / `audiobook` / `hardcopy`) and/or search support during this
update cycle, plus the admin-managed `priority` ranking that now backs most of them.

All book-format filters accept exactly: `ebook`, `audiobook`, `hardcopy`.
REST also accepts the alias `hardcover` on the homepage endpoints only (normalized to `hardcopy`).

---

## 1) Admin `priority` ranking (new)

- New nullable `Book.priority` field (`Int?`), admin-editable.
- Sort rule used everywhere it applies: **ascending, nulls last** —
  `orderBy: [{ priority: { sort: "asc", nulls: "last" } }, ...existing tiebreaker]`.
  Lower number shows first (`1` before `2` before `3`); books an admin never touched
  (`priority = null`) sort after every prioritized book, keeping the section's original
  ranking as the tiebreaker among them.
- **Exempt from priority:** "Top 10 Most Read" (tRPC `sort: "mostRead"`, REST section
  `topMostRead`) — sorted purely by `total_reads` so genuine reader behavior can't be
  overridden by a manual boost.
- **Exempt from priority:** personalized sections — Continue Reading/Listening,
  Recommended For You, Because You Read use their own relevance/recency logic, not `priority`.
- Applied to: homepage REST paginated sections (`newReleases`, `popularBooks`,
  `popularAudiobooks`, `popularHardCopies`, `popularEbooks`, `editorsPick`, `freeBooks`,
  `trendingNow`) and category-sections REST endpoints.

---

## 2) REST (mobile/Flutter) — `/api/v1/*`

### `GET /api/v1/homepage`
- `?type=ebook|audiobook|hardcopy|hardcover` — new. Invalid values return
  `400 { error: "Invalid type. Allowed values: ebook, audiobook, hardcopy" }`.
- `?limit=` — default 10, capped at 50.

### `GET /api/v1/homepage/:section`
- Same `?type=` validation as above.
- For paginated sections (see list below): `?limit=` (default 20, max 50), `?offset=`
  (default 0), and **`?search=`** — new this cycle.
- Paginated sections: `trendingNow`, `newReleases`, `popularBooks`, `popularAudiobooks`,
  `popularHardCopies`, `popularEbooks`, `editorsPick`, `freeBooks`, `topMostRead`,
  `becauseYouRead`.
  - `popularAudiobooks` / `popularHardCopies` / `popularEbooks` are single-format sections:
    a `type` that doesn't match returns an empty page rather than an error.
  - `topMostRead` ignores `priority` (see §1).
  - `becauseYouRead` requires auth (`req.auth.userId`); unauthenticated requests get an
    empty page, not an error.
- Non-paginated sections (`slider`, `appDownload`, `allCategory`, `allAuthor`,
  `allNarrators`, `allTranslators`, `countsValue`, `continueReading`, `continueListening`,
  `radio`, `currentUser`) are unaffected by `search`.

### `GET /api/v1/category-sections`
- `?limit=`, `?offset=` — pagination over the section list itself.
- `?format=ebook|audiobook|hardcopy` — new, filters each section's preview books.
- `?search=` — new, filters each section's preview books by title.
- `?books_limit=` — new, overrides each section's admin-configured preview count (capped 50).

### `GET /api/v1/category-sections/:id/books`
- `?limit=`, `?offset=`, `?format=`, `?search=` — `format`/`search` new this cycle
  (full "see all" list for one category section).

### `GET /api/v1/books`
- Parses the same `bookListSchema` used by the tRPC input, directly from `req.query` — so it
  already supports `format` and `search`, plus every other `bookListSchema` field
  (`categoryId`, `isFeatured`, `isBestseller`, `isFree`, `isNew`, `language`, `author`,
  `publisher`, `narrator`, `translator`, `authorId`, `publisherId`, `translatorId`, `cursor`,
  `limit`).

### `GET /api/v1/search`
- `?q=` (min 2 chars, required), `?limit=`, `?offset=`, and **`?format=ebook|audiobook|hardcopy`**
  — new. Same silent-ignore-if-invalid behavior as `/books` and `/category-sections` (not an
  error, unlike `/homepage`'s `?type=`). A book matches only if it has an available, approved
  format row of that type — same shape as every other format filter in this doc, just applied
  here for the first time.

### Known gaps (not changed this cycle — flagging for awareness)
- `GET /api/v1/categories/:id/books` supports `?format=` but **not** `?search=`.

---

## 3) Param-name inconsistency (for client implementers)

The filter param is spelled differently depending on the endpoint — worth knowing when
wiring up the Flutter app:

| Endpoint | Format filter param | Search param |
|---|---|---|
| `/homepage`, `/homepage/:section` | `type` (not `format`) | `search` (section endpoint only) |
| `/category-sections`, `/category-sections/:id/books` | `format` | `search` |
| `/books` | `format` | `search` |
| `/categories/:id/books` | `format` | — (not supported) |
| `/search` | `format` | `q` (not `search`) |
| `/search` | — (not supported) | `q` |
