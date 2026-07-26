# iOS Payment Configuration API

Lets the iOS app ask the backend, at runtime, whether the SSLCommerz payment
option should be shown at checkout. Apple App Review is stricter about
third-party payment rails than Android/web, so this is admin-controlled and
country-gated rather than hardcoded in the app.

---

## `GET /api/v1/payment/config/ios`

Public — no auth required. Returns a single boolean the iOS app uses to
show/hide the SSLCommerz option.

**Headers:** none required. `Authorization: Bearer <token>` may be sent but
is not used by this endpoint.

```http
GET /api/v1/payment/config/ios
```

**Success (200):**
```json
{
  "success": true,
  "show_sslcommerz": true
}
```

### Logic

1. Read the `sslcommerz_enabled_ios` platform setting. If it's not `"true"`,
   respond immediately with `show_sslcommerz: false`.
2. Otherwise detect the caller's country:
   - Prefer the `CF-IPCountry` header (set automatically if a Cloudflare-style
     proxy sits in front of the API).
   - Fall back to an offline GeoLite2 lookup (`geoip-lite`) against the
     request IP — this is the path used today, since the production API is
     **not** currently proxied through Cloudflare (`nginx/api.boiaro.com.conf`
     forwards directly).
3. Read the `allowed_countries_ios` platform setting (comma-separated ISO
   3166-1 alpha-2 codes, e.g. `BD`). If the detected country is in that list,
   respond `show_sslcommerz: true`; otherwise `false`.

If the country can't be detected (e.g. private/loopback IP in local dev),
`show_sslcommerz` is `false`.

---

## Admin configuration

Two key-value rows in `platform_settings` (same table used by ad settings,
TTS voices, etc.):

| Key | Type | Example | Meaning |
| :--- | :--- | :--- | :--- |
| `sslcommerz_enabled_ios` | `"true"` \| `"false"` | `"true"` | Global kill switch for SSLCommerz on iOS |
| `allowed_countries_ios` | comma-separated ISO codes | `"BD"` | Countries allowed to see SSLCommerz on iOS, when the switch above is on |

Managed in the admin panel under **Payment Gateways → iOS SSLCommerz
Visibility** (`src/pages/admin/AdminPaymentGateways.tsx`), backed by the
existing generic `admin.getPlatformSettings` / `admin.bulkSetPlatformSettings`
tRPC procedures — no new admin API was needed.

---

## Implementation

- `server/src/routes/rest/payment-config.ts` — the endpoint (`paymentConfigRestRouter`)
- `server/src/lib/geoCountry.ts` — `detectCountryCode(req)` helper (CF header → geoip-lite fallback)
- `server/src/routes/rest/index.ts` — mounted at `restRouter.use("/payment/config", paymentConfigRestRouter)`
- `src/pages/admin/AdminPaymentGateways.tsx` — admin toggle + country list input
