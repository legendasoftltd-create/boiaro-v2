# Translator Feature — Full API Reference

This document lists every API (tRPC and REST), database change, and frontend route added or modified to support the **Translator** role/entity. Translator was built to mirror **Author** as closely as possible: a dedicated profile table, admin CRUD, a public profile page, book-detail display, and creator-dashboard access — the same pattern Author/Narrator/Publisher already use.

Base URLs:
- tRPC: `{API_BASE}/trpc/{router}.{procedure}`
- REST: `{API_BASE}/api/v1/...`

---

## 1. Database schema changes

| Change | Detail |
| :--- | :--- |
| `AppRole` enum | Added `translator` value. Migration: `20260625175157_add_translator_role` |
| New `Translator` model | Mirrors `Author` exactly. Migration: `20260625202557_add_translator_table` |
| `Book.translator_id` | New nullable FK column → `translators.id`, `ON DELETE SET NULL`. Same migration as above. |

```prisma
model Translator {
  id          String   @id @default(uuid())
  avatar_url  String?
  bio         String?
  created_at  DateTime @default(now())
  email       String?
  genre       String?
  is_featured Boolean? @default(false)
  is_trending Boolean? @default(false)
  linked_at   DateTime?
  name        String
  name_en     String?
  phone       String?
  priority    Int      @default(0)
  status      String   @default("active")
  updated_at  DateTime @updatedAt
  user_id     String?

  books Book[]

  @@map("translators")
}
```

A translator is assigned to a book the same way an author is: `Book.translator_id` is a plain FK, set directly from the admin Book Add/Edit form (no junction table). There is **no separate payout/commission model** for translators yet — earnings/withdrawal endpoints intentionally do not include the `translator` role.

---

## 2. New tRPC procedures

### `books.translators` — list translators (public)
Mirrors `books.authors`.

**Auth:** none
**Input:** none
**Output:** `Array<Translator & { booksCount: number; followers: 0 }>`, ordered by `priority desc, name asc`. `booksCount` = count of approved books where `translator_id` matches.

### `books.translatorById` — get translator profile (public)
Mirrors `books.authorById`.

**Auth:** none
**Input:** `{ id: string }` (Translator id, not user id)
**Output:** `(Translator & { books: BookSummary[] }) | null`. `books` = approved books where `translator_id === id`.

### `admin.listTranslators` — list/search translators (admin)
Mirrors `admin.listAuthors`.

**Auth:** admin
**Input:** `{ search?: string }`
**Output:** `Translator[]`, ordered by `priority desc, name asc`. Searches `name`/`name_en` (case-insensitive) when `search` is given.

### `admin.createTranslator` — create a translator profile (admin)
Mirrors `admin.createAuthor`.

**Auth:** admin
**Input:**
```ts
{
  name: string;            // required
  name_en?: string;
  bio?: string;
  genre?: string;
  avatar_url?: string;
  phone?: string;
  is_featured?: boolean;
  is_trending?: boolean;
  priority?: number;
}
```
**Output:** created `Translator` row.

### `admin.updateTranslator` — update a translator profile (admin)
Mirrors `admin.updateAuthor`. Same input shape as `createTranslator` plus required `id: string` and optional `status?: string`. All fields except `id` optional.

### `admin.deleteTranslator` — delete a translator profile (admin)
Mirrors `admin.deleteAuthor`.

**Auth:** admin
**Input:** `{ id: string }`
**Output:** deleted `Translator` row. (Sets `Book.translator_id` to `null` on any books that referenced it, via the FK's `ON DELETE SET NULL`.)

---

## 3. Updated tRPC procedures

| Procedure | What changed |
| :--- | :--- |
| `books.list` | Shares the `listBooks()` service function with `GET /books` (REST) — see section 5 below for the new `translatorId`/`translator` filter params and `translator` field. Consumed by `useBooks()` (homepage feed) and `SmartSearch`. |
| `books.browseBooks` | Separate procedure (paginated browse/filter page, `page`/`pageSize`/`format`/`sort`). `include` now has `translator` (same shape as `author`) alongside every returned book |
| `books.bySlug` | `include` now has `translator: true` |
| `books.detail` | `include` now has `translator: true`; returned book object includes `translator` like `author` |
| `books.userBookmarks` | Each bookmark's `book.translator` (`{id, name}`) now included |
| `books.homepageCategorySections` | Each book in every category section now includes `translator: {id, name}` |
| `books.recentlyViewed` | Each book now includes `translator: {id, name, name_en}` |
| `books.recommendations` | Both the "no bookId" and "related to bookId" branches now include `translator: {id, name}` |
| `books.myCreatorBooks` | `role` input enum now accepts `"translator"`. New resolution path: looks up `Translator.user_id === ctx.userId`, then returns books where `translator_id` matches. `formatByRole` maps `translator → "ebook"` for the self-submitted-books path (translators don't self-submit, so this is effectively unused but kept for consistency). |
| `profiles.applyForRole` | `role` input enum now accepts `"translator"` — users can self-apply to become a translator the same way they apply for writer/narrator/publisher |
| `profiles.readingProgress` | Each progress item's `book.translator` (`{id, name}`) now included |
| `profiles.listeningProgress` | Same as above |
| `admin.listBooks` | `include` now has `translator: {id, name}` (drives the "Translator" column on the admin Books list) |
| `admin.upsertBook` | Already accepted arbitrary `Book` fields — now also accepts/persists `translator_id` the same way it does `author_id` (no schema change needed in the procedure itself, just the new column) |
| `admin.createCreator` | `role` enum → added `"translator"`; `profileTable` enum → added `"translators"`. When `profileTable === "translators"`, creates a `Translator` row linked to the new user. |
| `admin.linkCreatorProfile` | Same enum additions; links an existing `Translator` row to an existing user account. |
| `admin.unlinkCreatorProfile` | Same enum additions; unlinks a `Translator` row from its user, and removes the `translator` `UserRole` if no other `Translator` row still references that user. |
| `admin.approveRoleApplication` | When `applied_role === "translator"`, creates a `Translator` row for the applicant (mirrors the writer/narrator/publisher branches) in addition to granting the `UserRole`. |
| `admin.getAdminUserDetailPage` | `type` input enum → added `"translator"`. Returns the `Translator` record plus linked user/profile/books/earnings/withdrawals (earnings/withdrawals will be empty — no payout model). |
| `admin.updateAdminCreatorProfile` | `type` input enum → added `"translator"`. Updates a `Translator` row's `name`, `name_en`, `email`, `status`, `priority`, `is_featured`, `is_trending`, `bio`, `avatar_url`, `genre`. |
| `admin.getCreatorLinksByUser` | Response now includes a `translators: CreatorLink[]` array alongside `authors`/`publishers`/`narrators` |
| `admin.getUserStats` | The `creators` count now includes users with the `translator` role |
| `admin.listCreatorPermissionUsers` | `role: { in: [...] }` filter now includes `"translator"` — translators now appear in the Creator Permissions admin page |

Internal constant `APP_ROLE_VALUES` (used by the admin-role-permission-sync logic in `admin.ts`) also gained `"translator"`.

---

## 4. New REST endpoints (`/api/v1/...`)

### `GET /translators`
List translators with pagination. No auth required. Mirrors `GET /authors`.

**Query params:** `limit` (int, default 20, max 50), `offset` (int, default 0)

**Response (200):**
```json
{
  "translators": [
    {
      "id": "uuid",
      "name": "অনুবাদকের নাম",
      "name_en": "Translator Name",
      "avatar_url": "https://...",
      "bio": "...",
      "genre": "Fiction",
      "is_featured": true,
      "is_trending": false,
      "priority": 1
    }
  ],
  "total": 12,
  "limit": 20,
  "offset": 0
}
```

### `GET /translators/:id`
Get one translator's details. No auth required.

**Response (200):** translator object (same shape as list item) plus `followers_count`, `books_count`, `is_following`.
**Response (404):** `{ "error": "Translator not found" }`

### `POST /translators/:id/follow`
Follow a translator. **Auth required.**

### `POST /translators/:id/unfollow`
Unfollow a translator. **Auth required.**

---

## 5. Updated REST endpoints

| Endpoint | What changed |
| :--- | :--- |
| `GET /books` | New query params: `translator` (translator id, alias) and `translatorId` (translator id) — filters books by translator, same pattern as `author`/`authorId`. Each returned book now includes `translator: { id, name, name_en, avatar_url, bio, genre, is_featured }`. |
| `GET /books/:id` | Response now includes `translator` alongside `author`, `publisher`, `category`, `formats` |
| `GET /books/slug/:slug` | Same as above |
| `GET /homepage` | Response now includes `allTranslators: Translator[]` |
| `GET /homepage/:section` | `translators` data is now reachable via the section key `allTranslators` (added to the section map — previously this key existed in the data but the per-section endpoint had no route to it) |
| `GET /search` | Each result book now includes `translator: { name }` |
| `GET /library/purchases` | Each purchased book now includes `translator: { name }` |
| `GET /category-sections` | Each book in every section now includes `translator: { id, name, name_en }` |

---

## 6. Frontend routes/pages added

| Route | Component | Mirrors |
| :--- | :--- | :--- |
| `/translators` | `src/pages/TranslatorsPage.tsx` | `/authors` → `AuthorsPage.tsx` |
| `/translator/:id` | `src/pages/TranslatorProfile.tsx` | `/author/:id` → `AuthorProfile.tsx` |
| `/admin/translators` | `src/pages/admin/AdminTranslators.tsx` | `/admin/authors` → `AdminAuthors.tsx` |
| `/admin/user/translator/:id` | `src/pages/admin/AdminUserDetail.tsx` (generic, `type` param) | same component used for author/narrator/publisher |
| `/creator` (when role = translator) | `src/pages/translator/TranslatorDashboard.tsx` | `/creator` (writer) → `WriterDashboard.tsx`, but shows assigned books via `myCreatorBooks` instead of submission stats — no earnings, since no payout model exists |
| `/creator/profile` (when role = translator) | `src/pages/translator/TranslatorProfile.tsx` | `/creator/profile` (writer) → `WriterProfile.tsx`, both wrap the generic `CreatorProfilePage` |

New homepage widget: `src/components/Translators.tsx` (carousel, mirrors `Authors.tsx`/`Narrators.tsx`), registered in `Index.tsx`'s section registry under key `translators`, and added to `HOMEPAGE_SECTION_DEFAULTS` in `admin.ts` (`sort_order: 18`).

> **Action needed after deploy:** the homepage-sections table only auto-seeds when empty. On databases that already have rows (staging/production), an admin must click **"Reset Homepage Sections"** (non-hard reset) in Admin → Homepage Sections once, so the new `translators` row gets inserted (existing rows are untouched — it only adds missing keys).

---

## 7. What was deliberately left out

- **No payout/commission model.** `profiles.creatorStats`, `profiles.myEarnings`, `profiles.requestWithdrawal`, the `EarningsDashboard`/`VendorEarningsPreview` components, and `server/src/lib/earnings.ts` do not include `"translator"`. There's no defined revenue split for translators yet, so building earnings UI/APIs would mean inventing numbers.
- **No self-submission flow.** `books.submitBook` and `books.attachBookFormat` don't accept `role: "translator"` — translators are assigned to existing books by an admin (via the Book Add/Edit form's Translator field), they don't submit new books themselves.
- **`BookContributor`/Contributors widget** no longer offers "Translator" as a role option (it was the original mechanism before the dedicated `Translator` table existed; superseded, removed to avoid two competing assignment UIs).
