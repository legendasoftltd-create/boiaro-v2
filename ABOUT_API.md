# "BoiAro সম্পর্কে" (About) Section — Mobile API Reference

Everything the mobile app needs to render an About screen matching the website's `/about` hub:
13 items in a fixed order, backed by three kinds of content — static pages, structured lists
(via the existing blog/article system), and a dedicated team list.

Base URL: `{API_BASE}/api/v1`

---

## 1. The 13 items, in order, and what backs each one

| # | Label (bn) | Content type | Endpoint |
| :-- | :--- | :--- | :--- |
| 1 | BoiAro সম্পর্কে | Static page | `GET /pages/about` |
| 2 | আমাদের লক্ষ্য ও উদ্দেশ্য | Static page | `GET /pages/mission` |
| 3 | ফিচারসমূহ | Static page | `GET /pages/features` |
| 4 | BoiAro টিম ও ম্যানেজমেন্ট | Structured list | `GET /team` |
| 5 | পুরস্কার ও স্বীকৃতি | Structured list | `GET /blog?category=award` |
| 6 | সংবাদ ও মিডিয়া | Structured list | `GET /blog?category=news` |
| 7 | ইভেন্ট | Structured list | `GET /blog?category=event` |
| 8 | সাধারণ প্রশ্ন—FAQ | Static page | `GET /pages/faq` |
| 9 | রিফান্ড ও ক্যানসেলেশন নীতি | Static page | `GET /pages/refund-policy` |
| 10 | গোপনীয়তা নীতি | Static page | `GET /pages/privacy-policy` |
| 11 | শর্তাবলি | Static page | `GET /pages/terms` |
| 12 | যোগাযোগ | Static page | `GET /pages/contact` |
| 13 | অ্যাপ তথ্য / Version Information | Client-side | see §5 — no dedicated endpoint |

This order is intentional (matches the website's `/about` hub) — build the mobile About screen's
menu in the same sequence so the two stay consistent.

None of these endpoints require auth.

---

## 2. Static pages — `GET /pages/:slug`

One endpoint for items 1, 2, 3, 8, 9, 10, 11, 12. Content is admin-editable HTML (rich text),
same system that backs the website's `/page/:slug` route.

**Success (200):**
```json
{
  "id": "uuid",
  "slug": "about",
  "title": "BoiAro সম্পর্কে",
  "content": "<p>...</p><h2>...</h2>...",
  "featured_image": null,
  "seo_title": "BoiAro সম্পর্কে",
  "seo_description": "...",
  "seo_keywords": null,
  "updated_at": "2026-08-11T17:00:00.000Z"
}
```

- `content` is HTML — render it in a WebView or an HTML-to-native-widgets renderer, not as plain
  text (it contains `<h2>`, `<ul>`, `<strong>`, `<a>`, etc.).
- The 8 slugs above are already seeded with real starter content — no empty-state handling needed
  for these specifically, though the endpoint still 404s for any slug that doesn't exist.

**Error (404):**
```json
{ "error": "Page not found" }
```
(Returned both when the slug doesn't exist and when it exists but isn't published yet.)

---

## 3. Team & Management — `GET /team`

Backs item 4. Returns active team members in the order the admin set.

**Success (200):**
```json
[
  {
    "id": "uuid",
    "name": "রহিম আহমেদ",
    "role_title": "Founder & CEO",
    "photo_url": "https://.../rahim.jpg",
    "bio": "...",
    "facebook_url": "https://facebook.com/...",
    "linkedin_url": "https://linkedin.com/in/...",
    "twitter_url": null,
    "sort_order": 0
  }
]
```

- Any of `photo_url`, `bio`, `facebook_url`, `linkedin_url`, `twitter_url` may be `null` — a
  member with no photo should fall back to an initials/placeholder avatar client-side.
- Can return `[]` (no team members added yet) — show an empty state, not an error.

---

## 4. News, Events, Awards — `GET /blog`

Items 5, 6, 7 all reuse the same article list endpoint, filtered by `category`. This is the same
system that backs the website's `/blog` page — an admin writes a post and tags it `award`,
`news`, or `event` to make it show up in the matching About section.

| Item | `category` value |
| :--- | :--- |
| পুরস্কার ও স্বীকৃতি (Awards) | `award` |
| সংবাদ ও মিডিয়া (News & Media) | `news` |
| ইভেন্ট (Events) | `event` |

**Request:** `GET /blog?category=news&limit=20`

| Param | Required | Notes |
| :--- | :--- | :--- |
| `category` | ✅ for these 3 items | Omit entirely to get the general blog feed instead — not needed for the About section |
| `limit` | ❌ | Default 10, max 50 |
| `cursor` | ❌ | For pagination — pass the previous response's `nextCursor` |

**Success (200):**
```json
{
  "posts": [
    {
      "id": "uuid",
      "title": "BoiAro wins ...",
      "slug": "boiaro-wins-...",
      "excerpt": "Short summary...",
      "cover_image": "https://...",
      "category": "award",
      "tags": ["press"],
      "author_name": "BoiAro Team",
      "publish_date": "2026-08-01T00:00:00.000Z",
      "is_featured": false
    }
  ],
  "nextCursor": "uuid-or-absent"
}
```
- `nextCursor` is absent when there are no more pages.
- For Events specifically: `publish_date` doubles as the event date — there's no separate
  "event start/end" field. Sort is always newest-`publish_date`-first.
- Empty `posts: []` is normal (nothing published in that category yet) — show an empty state.

**Detail view — `GET /blog/:slug`:**
```json
{
  "id": "uuid",
  "title": "...",
  "slug": "...",
  "content": "<p>...</p>",
  "excerpt": "...",
  "cover_image": "https://...",
  "category": "news",
  "tags": ["press"],
  "author_name": "BoiAro Team",
  "publish_date": "2026-08-01T00:00:00.000Z",
  "is_featured": false,
  "status": "published"
}
```
`content` is HTML, same rendering note as §2. 404s with `{ "error": "Article not found" }` for a
missing or unpublished slug.

---

## 5. App Info / Version Information (item 13)

There's no dedicated endpoint for this — it's inherently client-side information (the mobile
app's own version, build number, platform), not admin-authored content. Render it using values
already available to the app:

- App version / build number: from the app's own package/bundle metadata (`pubspec.yaml` version
  for Flutter, or the platform's native version APIs).
- Platform: `"Android"` / `"iOS"`, known client-side.
- Store links / update prompts: use your existing app-store URLs, or fetch them from
  `GET /footer` (already documented in `REST_API.md`) if you want them centrally configurable
  rather than hardcoded — it returns `{ "footerData": [{ "key": "app_android_url", "value": "..." }, ...] }`,
  a flat list of site settings; find the rows keyed `app_android_url` / `app_ios_url` /
  `app_download_enabled` in that array.
- Legal links: point to items 10/11 (`GET /pages/privacy-policy`, `GET /pages/terms`) so the
  App Info screen can link out to them, matching the website's layout.

---

## 6. Example — building the About menu

```
GET /api/v1/pages/about        → item 1 content
GET /api/v1/pages/mission      → item 2 content
GET /api/v1/pages/features     → item 3 content
GET /api/v1/team               → item 4 list
GET /api/v1/blog?category=award → item 5 list
GET /api/v1/blog?category=news  → item 6 list
GET /api/v1/blog?category=event → item 7 list
GET /api/v1/pages/faq            → item 8 content
GET /api/v1/pages/refund-policy  → item 9 content
GET /api/v1/pages/privacy-policy → item 10 content
GET /api/v1/pages/terms          → item 11 content
GET /api/v1/pages/contact        → item 12 content
(item 13 is local — see §5)
```

Fetch on-demand (when the user taps into each menu item) rather than all 12 up front — these are
static/slow-changing pages, so a short client-side cache (a few minutes to an hour) is reasonable
and avoids re-fetching content that rarely changes.
