# Homepage Ranking Sections API (Best Sellers / Special Offers / Trending Now / Top 10 Audiobooks)

Reference for the mobile app on the four automatically-ranked homepage
sections added under **Hard Copy** (Best Sellers, Special Offers) and
**Audiobook** (Trending Now, Top 10 Audiobooks). All four rank books from
real platform activity — sales, discounts, and listening data — computed
server-side. There is nothing for the client to compute; just request the
section and render the page it returns.

Base URL: `https://boiaro.com/api/v1` (see [REST_API.md](REST_API.md) for
auth headers, the response envelope, and every other homepage section —
this doc only covers these four and the ranking behind them).

---

## Summary

| Section key | Category | Ranked by | Window |
| :--- | :--- | :--- | :--- |
| `bestSellers` | Hard Copy | Sum of `OrderItem.quantity` for real (paid, non-cancelled/returned) orders | Rolling 180 days |
| `specialOffers` | Hard Copy | Discount % (highest first) | None — anything with an active discount right now |
| `trendingAudiobooks` | Audiobook | Count of new unique listeners (`BookListen`, one row per user per book) | Rolling 14 days |
| `topAudiobooks` | Audiobook | Count of unique listeners, all time | None — lifetime |

None of these read the manually-admin-set `Book.is_bestseller`/`is_featured`
flags — they reflect what's actually happening on the platform. If a section
looks empty, it's telling the truth (e.g. no hardcopy orders have gone
through yet, or nobody has discounted a book) rather than falling back to a
curated list.

---

## Request

All four are regular **paginated** homepage sections — same endpoint shape
as `popularAudiobooks`, `popularHardCopies`, etc.

```http
GET /api/v1/homepage/{section}?limit=10&offset=0
```

| Query param | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `limit` | int | 20 | 1–50. Pass `10` for a "Top 10" style row. |
| `offset` | int | 0 | For "See more" / infinite scroll within the section. |
| `type` | string | — | Optional format filter. Passing a format the section doesn't apply to (e.g. `type=ebook` on `bestSellers`) returns an empty page, not an error — these sections are already format-locked (`bestSellers`/`specialOffers` are hardcopy-only, `trendingAudiobooks`/`topAudiobooks` are audiobook-only). |
| `search` | string | — | Narrows by title, applied *within* the ranked list (a low-ranked match can still appear if it matches; it isn't re-ranked by relevance). |

No authentication required.

---

## Response

```json
{
  "section": "bestSellers",
  "data": [
    {
      "id": "uuid",
      "title": "বইয়ের নাম",
      "title_en": "Book Title",
      "slug": "boi-yer-naam",
      "cover_url": "https://.../cover.jpg",
      "rating": 4.5,
      "total_reads": 1200,
      "is_free": false,
      "is_featured": false,
      "subscriber_access": false,
      "created_at": "2026-01-01T00:00:00.000Z",
      "author": { "id": "uuid", "name": "লেখকের নাম", "avatar_url": null },
      "translator": null,
      "category": { "id": "uuid", "name": "উপন্যাস", "slug": "novel" },
      "formats": [
        { "format": "hardcopy", "price": 350, "original_price": 400, "discount": 12.5, "in_stock": true }
      ]
    }
  ],
  "total": 47,
  "limit": 10,
  "offset": 0,
  "has_more": true
}
```

- `total`/`has_more` reflect the section's *entire* ranked list (capped
  internally at 300 candidates before pagination), not just the current
  page — use them for "See more" the same way as any other paginated
  homepage section.
- `formats` is filtered to available, approved formats only. For
  `bestSellers`/`specialOffers` this always includes a `hardcopy` entry;
  for `trendingAudiobooks`/`topAudiobooks` it always includes an
  `audiobook` entry — a book can still carry other formats too (e.g. an
  ebook edition), they just aren't what the section ranked on.
- `formats[].discount` and `formats[].original_price` are now present on
  every homepage section's book payload (not just `specialOffers`) — use
  `discount` to render a "X% OFF" badge anywhere a hardcopy price shows.

---

## `bestSellers` — real sales, not a manual flag

Sums `OrderItem.quantity` per hardcopy book across orders placed in the
last 180 days, **excluding** orders with `status` in `cancelled`,
`returned`, or `pending` (same exclusion the admin financial/revenue
reports already use — a pending or cancelled order was never actually
fulfilled, so it shouldn't count as a "sale").

This is deliberately **not** the same as `Book.is_bestseller` (a flag an
admin sets by hand) — `browseBooks`'s existing `filter=bestseller` on the
web still reads that flag for a curated list; `bestSellers` here reflects
what customers have actually bought recently. Expect the two lists to
disagree, and don't try to reconcile them — they answer different
questions.

```http
GET /api/v1/homepage/bestSellers?limit=10
```

---

## `specialOffers` — currently discounted hardcopies

Any hardcopy format with `discount > 0` set (via Admin → Books → the
format's discount field), ranked by discount percentage, highest first.
Ties fall back to admin `priority`, then newest first.

```http
GET /api/v1/homepage/specialOffers?limit=10
```

There's no time window — a book stays in this section for as long as its
discount stays set. Removing the discount (or setting it back to 0) drops
it from the section on the next request; there's nothing to "expire" or
clean up separately.

---

## `trendingAudiobooks` — "Trending Now"

Counts `BookListen` rows created in the last 14 days per audiobook.
`BookListen` is a unique-per-(user, book) table, so this measures **new
listeners starting the book recently**, not total playback volume or
replays — the same "unique engagement, not raw events" convention the
platform already uses for `total_reads`.

```http
GET /api/v1/homepage/trendingAudiobooks?limit=10
```

This is a different signal from the existing `popularAudiobooks` section,
which ranks by `Book.total_reads` — a generic, all-time counter shared
with ebooks (a "read" and a "listen" both increment it), with no
audiobook-specific or time-bounded meaning. Don't treat the two as
interchangeable; `trendingAudiobooks` is the one that actually answers
"what's getting listened to lately."

---

## `topAudiobooks` — "Top 10 Audiobooks"

Same `BookListen` source as `trendingAudiobooks`, with no recency window —
all-time unique-listener count. Pass `limit=10` for the literal "Top 10"
widget; the endpoint itself is a normal paginated section if you want to
show more.

```http
GET /api/v1/homepage/topAudiobooks?limit=10
```

---

## Also on the web

The equivalent web (tRPC) procedures are `books.bestSellers`,
`books.specialOffers`, `books.trendingAudiobooks`, and
`books.topAudiobooks` — same ranking logic (they call the same server-side
functions in `services/books.service.ts`), so the website and the app
always agree on what's currently a bestseller, on offer, or trending. They
take `{ limit, search }` and return a plain array (no pagination
envelope) — the mobile REST endpoints above are the ones to use for the
app.
