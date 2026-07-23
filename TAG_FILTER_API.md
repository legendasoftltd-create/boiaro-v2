# Tag Filter API

Documentation for browsing books by tag. Book tags are a plain string array on
`Book.tags` (not a relational model) — e.g. `["থ্রিলার", "বাংলা সাহিত্য"]`.

Two integration styles are available and both support the same filter:

- **REST** (`/api/v1/*`) — used by the mobile/Flutter app.
- **tRPC** (`trpc.books.*`) — used by the web app.

---

## 1) REST (mobile/Flutter) — `/api/v1/*`

### `GET /api/v1/books/tags/list`

Distinct tags across approved/active books, each with a usage count, sorted
most-used first. Use this to populate a tag filter chip list. No auth
required.

**Query params:**

| Param | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| search | string | — | Case-insensitive substring filter on tag name |

```http
GET /api/v1/books/tags/list
GET /api/v1/books/tags/list?search=thriller
```

**Success (200):**
```json
[
  { "tag": "বাংলা সাহিত্য", "count": 82 },
  { "tag": "ছোট গল্প", "count": 70 },
  { "tag": "থ্রিলার", "count": 23 }
]
```

### `GET /api/v1/books?tag=...`

The existing book-listing endpoint now accepts a `tag` param — filters to
books whose `tags` array contains that exact string. Composable with every
other `bookListSchema` param (`categoryId`, `format`, `isFree`, `search`,
`cursor`, `limit`, ...).

```http
GET /api/v1/books?tag=থ্রিলার&limit=20
```

**Success (200):** same shape as the unfiltered endpoint —
```json
{
  "books": [ { "id": "uuid", "title": "...", "tags": ["থ্রিলার", "..."], "...": "..." } ],
  "nextCursor": "uuid-of-last-item"
}
```

Implementation: `server/src/schemas/books.ts` (`bookListSchema.tag`,
`bookTagsQuerySchema`), `server/src/services/books.service.ts` (`listBooks`,
`listBookTags`), `server/src/routes/rest/books.ts`.

---

## 2) tRPC (web) — `trpc.books.*`

### `books.tags`

```ts
trpc.books.tags.useQuery({ search: "thriller" }) // search is optional
```

Returns the same shape as the REST list: `{ tag: string; count: number }[]`.

### `books.browseBooks`

Now accepts an optional `tag: string` alongside its existing `categoryId`,
`format`, `filter`, `query`, `sort`, `page`, `pageSize` params, filtering with
Prisma's `tags: { has: tag }`.

Implementation: `server/src/routers/books.ts` (`tags` procedure,
`browseBooks` input/where clause).

---

## 3) Web UI

`src/pages/BooksPage.tsx` renders the tag list as pills below the category
pills (`useTags()` from `src/hooks/useBooks.ts`), synced to the `?tag=`
URL param. Selecting a tag filters results server-side via
`books.browseBooks`; the tag list stays visible so the selection can be
changed without backing out.
