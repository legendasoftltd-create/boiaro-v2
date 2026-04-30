# API Updates Documentation

This document summarizes the API work completed in this update cycle, including new endpoints, behavior changes, and documentation updates.

## 1) Homepage REST API

### Updated endpoint

- `GET /api/v1/homepage`

### New endpoint

- `GET /api/v1/homepage/:section`

### What changed

- Added section-wise homepage API so clients can fetch one block at a time.
- Added support for query `limit` with default value `10` (capped at `50`).
- Added support for query `type` on homepage APIs.
  - Supported values: `ebook`, `audiobook`, `hardcopy`
  - Accepted alias: `hardcover` (normalized to hardcopy matching)
- Added validation for invalid `type` values:
  - Returns `400` with: `Invalid type. Allowed values: ebook, audiobook, hardcopy`
- Applied `limit` consistently to homepage lists.
- Applied `type` filtering to book-based homepage sections.

### Supported homepage section keys

- `slider`
- `trendingNow`
- `popularBooks`
- `becauseYouRead`
- `editorsPick`
- `appDownload`
- `popularAudiobooks`
- `popularHardCopies`
- `popularEbooks`
- `topMostRead`
- `allCategory`
- `allAuthor`
- `allNarrators`
- `countsValue`
- `newReleases`
- `freeBooks`
- `continueReading`
- `continueListening`
- `radio`
- `currentUser`

## 2) Payments (SSLCommerz) REST API

### Updated endpoint

- `POST /api/v1/payments/initiate`

### Existing callback/IPN endpoints (kept active)

- `ALL /api/v1/payments/sslcommerz/success`
- `ALL /api/v1/payments/sslcommerz/fail`
- `ALL /api/v1/payments/sslcommerz/cancel`
- `POST /api/v1/payments/sslcommerz/ipn`

### What changed

- Replaced stub payment initiation logic with real SSLCommerz initialization.
- Added gateway enable/config checks from DB/environment.
- Added sandbox/live initialization URL handling based on gateway mode.
- Added creation/update of payment record with generated transaction ID.
- Added payment event logging for initiation.
- Updated order state to `awaiting_payment` during initiation.
- Initiate response now returns real data:
  - `success`
  - `gateway_url`
  - `transaction_id`
  - `raw_status`

## 3) tRPC Payment Flow Status

### Checked and confirmed

- SSLCommerz flow already existed in tRPC:
  - `orders.placeOrder` with `paymentMethod = "sslcommerz"`
- Result: both integration styles are supported now:
  - REST + tRPC

## 4) Books REST API

### Updated endpoint

- `GET /api/v1/books`

### What changed

- Added narrator object support inside each format in list response.
- Narrator data is now available per format as:
  - `formats[].narrators` (object or `null`)
- Kept existing book-level author and publisher objects intact.

### Why narrator is under formats

- Narrator is format-specific (primarily audiobook), so it belongs to format entries rather than top-level book object.
