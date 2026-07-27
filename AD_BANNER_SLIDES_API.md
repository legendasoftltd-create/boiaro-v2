# Ad Banner Slides — Mobile API

Ad banners can now carry multiple images per placement (e.g. `homepage_banner`), each with its own click-through link. The app should render a banner with one `slides` entry as a static image, and a banner with 2+ entries as an auto-rotating carousel (swipe + auto-advance every ~5s), matching the web behavior.

All endpoints are unauthenticated unless noted.

## GET `/api/v1/ads/banners`

Query params: `placement` (e.g. `homepage_banner`), `device` (`mobile` | `web` | omit for all).

```json
{
  "banners": [
    {
      "id": "banner-uuid",
      "title": "Publish your book",
      "placement_key": "homepage_banner",
      "display_order": 0,
      "device": "both",
      "impressions": 1834,
      "clicks": 18,

      "image_url": "https://.../first-slide.png",
      "destination_url": "https://boiaro.com/...",

      "slides": [
        { "id": "slide-1-uuid", "image_url": "https://.../first-slide.png", "destination_url": "https://boiaro.com/...", "display_order": 0 },
        { "id": "slide-2-uuid", "image_url": "https://.../second-slide.png", "destination_url": "https://boiaro.com/live", "display_order": 1 }
      ]
    }
  ]
}
```

- `slides` is the source of truth — always render from it. It's ordered, never empty for an active banner.
- The top-level `image_url` / `destination_url` are kept as a mirror of `slides[0]` only for older app builds already reading those fields — new integrations should ignore them and use `slides`.
- Each slide has its own `destination_url`, which may be `null` (image-only, not tappable).

## Recording impressions / clicks

```
POST /api/v1/ads/impression
POST /api/v1/ads/click
Body: { "banner_id": "banner-uuid", "slide_id": "slide-uuid" }
```

`slide_id` is optional but should be sent whenever known — it tracks which specific image drove the impression/click, since each slide links somewhere different. Omitting it still records the banner-level count. Impression should fire once per banner becoming visible (not once per slide rotation); click should fire with whichever slide was on screen when tapped.
