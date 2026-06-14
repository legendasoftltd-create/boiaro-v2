# Boiaro Platform — QA Fix Checklist

> Generated: 2026-06-14 | Based on full-project QA audit

---

## 🔴 CRITICAL

- [x] **C1** — Validate redirect URL origin in SSLCommerz payment callbacks to prevent open redirect / phishing  
  `server/src/routes/rest/payments.ts` lines 429–541

- [x] **C2** — Implement HMAC signature validation on all SSLCommerz IPN/callback handlers  
  `server/src/routes/rest/payments.ts` lines 427–548

- [x] **C3** — Remove `coin_cost` from REST `/wallet/unlock` request body; always fetch price from DB  
  `server/src/routes/rest/wallet.ts`

- [x] **C4** — Fix daily reward race condition — add DB-level unique constraint on `(user_id, date)` or use idempotent upsert  
  `server/src/routes/rest/wallet.ts` → `claim-daily` handler

---

## 🟠 HIGH

- [x] **H1** — Add `express-rate-limit` middleware to `/api/v1/auth` (20 req/15 min) and global `/api/v1` (120 req/min)  
  `server/src/index.ts`

- [x] **H2** — Consume `sessionStorage("post_login_redirect")` after successful login and navigate there  
  `src/contexts/AuthContext.tsx` (already implemented)

- [x] **H3** — Replace `Math.random()` referral code generation with `crypto.randomBytes()`  
  `server/src/routers/auth.ts`

- [x] **H4** — Serve audiobook tracks via signed, time-limited URLs (presigned S3 or proxy with token) — preview limit is currently UI-only  
  `src/components/audio-player/FullPlayer.tsx` + storage/media serving layer

- [x] **H5** — Add DB indexes: `CoinTransaction(user_id, created_at)`, `RewardedAdLog(user_id, created_at)`, `ContentUnlock(user_id, format)`, `Referral(referrer_id)`  
  `server/prisma/schema.prisma`

- [x] **H6** — Gate referral completion + coin grant on referred user's email verification, not on signup  
  `server/src/routers/auth.ts`

---

## 🟡 MEDIUM

- [x] **M1** — Add `limit` + `offset` pagination to `/library/purchases`, `/library/unlocks`, `/library/continue-reading`  
  `server/src/routes/rest/library.ts`

- [x] **M2** — Add `is_available: true` filter to the formats query inside the `detail` book procedure  
  `server/src/routers/books.ts` lines 641–650 (already implemented)

- [x] **M3** — Create `AuditLog` Prisma model and write entries for admin actions (approveBook, rejectBook, adjustUserCoins, banUser, updatePlatformSetting)  
  `server/prisma/schema.prisma` + `server/src/routers/admin.ts`

- [x] **M4** — Standardize all REST API responses to `{ success, error?, message?, data? }` shape  
  `server/src/routes/rest/*.ts`

- [x] **M5** — Add unique constraint `@@unique([user_id, ad_event_id])` to `RewardedAdLog` model  
  `server/prisma/schema.prisma`

- [x] **M6** — Add CSRF protection or `X-Requested-With` header check on all state-changing endpoints  
  `server/src/index.ts`

- [x] **M7** — Replace fragile `split("-").slice(1,6)` transaction ID parsing with strict regex validation  
  `server/src/routes/rest/payments.ts` lines 450–459

- [x] **M8** — Replace empty `.catch(() => {})` in payment finalization with proper error logging  
  `server/src/routes/rest/payments.ts` lines 526, 531

- [x] **M9** — Add prerequisites check in `approveBook` — require at least one approved format before allowing approval  
  `server/src/routers/admin.ts`

- [x] **M10** — Scroll to top on BooksPage pagination (`nextPage()` / `prevPage()` calls)  
  `src/pages/BooksPage.tsx`

---

## 🟢 LOW

- [x] **L1** — Fix narrator deduplication in BookDetail — deduplicate by `id` when `user_id` is absent on BookFormat narrator  
  `src/pages/BookDetail.tsx` lines 79–88 (already implemented — deduplicates by id + user_id)

- [x] **L2** — Set `<title>` and OG meta tags (`og:title`, `og:description`, `og:image`) dynamically per book  
  `src/pages/BookDetail.tsx`

- [x] **L3** — Validate extracted `trackId` is a valid UUID after parsing `audiobook_chapter_{trackId}` format string  
  `server/src/routes/rest/wallet.ts` line 313

- [x] **L4** — Sync playback speed preference to backend (keyed by `user_id + book_id`) so it persists across devices  
  `src/components/audio-player/FullPlayer.tsx` line 155

- [x] **L5** — Add `created_at` and `updated_at` timestamps to `ContentUnlock` model for unlock audit trail  
  `server/prisma/schema.prisma`

- [x] **L6** — Accept `limit` query param (max 50) on `/library/continue-reading` instead of hardcoded `take: 10`  
  `server/src/routes/rest/library.ts`

- [x] **L7** — Add `aria-label="Watch advertisement for coins"` and similar aria-labels to WatchAdButton and unlock buttons  
  `src/components/WatchAdButton.tsx`

- [x] **L8** — Add middleware to return `415 Unsupported Media Type` on POST/PATCH/PUT without `Content-Type: application/json`  
  `server/src/index.ts`

- [x] **L9** — Add referral code processing to REST signup flow (currently only in tRPC signup)  
  `server/src/routes/rest/auth.ts`

- [x] **L10** — Wrap `<Hero>` and main homepage sections in `<ErrorBoundary>` to prevent full-page crash  
  `src/pages/Index.tsx`

- [x] **L11** — Add cascade delete rules to Prisma relations (e.g. deleting a user should clean up unlocks, transactions, logs)  
  `server/prisma/schema.prisma`

---

## Progress

| Priority | Total | Done |
|----------|-------|------|
| 🔴 Critical | 4 | 4 |
| 🟠 High | 6 | 6 |
| 🟡 Medium | 10 | 10 |
| 🟢 Low | 11 | 11 |
| **Total** | **31** | **31** |
