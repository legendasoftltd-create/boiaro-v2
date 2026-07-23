# Tag Filter API

Documentation for browsing books by tag via the mobile/Flutter REST API
(`/api/v1/*`). Book tags are a plain string array on `Book.tags` (not a
relational model) — e.g. `["থ্রিলার", "বাংলা সাহিত্য"]`.

---

## `GET /api/v1/books/tags/list`

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

## `GET /api/v1/books?tag=...`

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
