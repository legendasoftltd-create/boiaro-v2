# BoiAro Mobile Auth API

**Base URL:** `https://boiaro.com/api/v1`  
**Content-Type:** `application/json`  
**Auth header:** `Authorization: Bearer <access_token>`

---

## Authentication Methods

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| Email / Password | `POST /auth/login` | Standard login |
| Phone OTP | `POST /auth/phone/send-otp` + `POST /auth/phone/verify-otp` | SMS one-time code |
| Google | `POST /auth/social/google` | Google OAuth token |
| Facebook | `POST /auth/social/facebook` | Facebook OAuth token |
| Token refresh | `POST /auth/refresh` | Renew expired access token |

---

## Phone OTP Login

The recommended login method for mobile apps. No password needed — user enters their phone number, receives a 6-digit SMS code, and is logged in. Account is created automatically on first login.

### Step 1 — Send OTP

```
POST /auth/phone/send-otp
```

**Request:**
```json
{ "phone": "01712345678" }
```

Accepted phone formats — all normalized to `880XXXXXXXXXX` internally:

| You send | Stored as |
| :--- | :--- |
| `01712345678` | `8801712345678` |
| `+8801712345678` | `8801712345678` |
| `8801712345678` | `8801712345678` |

**Response (200 — success):**
```json
{ "sent": true }
```

**Error responses:**

| Status | Body | Cause |
| :--- | :--- | :--- |
| 400 | `{ "error": "phone is required" }` | Missing field |
| 429 | `{ "error": "Please wait before requesting another OTP." }` | Rate limit — 1 OTP per 60 seconds per number |
| 500 | `{ "error": "SSL Wireless OTP credentials not configured" }` | Server misconfiguration |

---

### Step 2 — Verify OTP

```
POST /auth/phone/verify-otp
```

**Request:**
```json
{
  "phone": "01712345678",
  "otp": "482931"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| phone | string | ✅ | Same number used in Step 1 |
| otp | string | ✅ | 6-digit code, expires in 5 minutes |

**Response (200 — success):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user_id": "a1b2c3d4-...",
  "user": {
    "id": "a1b2c3d4-...",
    "email": "phone_8801712345678@boiaro.local",
    "roles": ["user"],
    "profile": {
      "display_name": "8801712345678",
      "phone": "8801712345678",
      "avatar_url": null,
      "bio": null,
      "preferred_language": null,
      "is_active": true,
      "referral_code": "XY12Z9"
    }
  }
}
```

> **Note on email:** Phone-created accounts use `phone_<msisdn>@boiaro.local` as a placeholder email. Users can update their display name and set a real email from profile settings later.

**Error responses:**

| Status | Body | Cause |
| :--- | :--- | :--- |
| 400 | `{ "error": "phone and otp are required" }` | Missing fields |
| 400 | `{ "error": "OTP expired or not found. Please request a new one." }` | OTP expired (5 min) or never sent |
| 400 | `{ "error": "Incorrect OTP. Please try again." }` | Wrong code entered |
| 403 | `{ "error": "Account deactivated. Contact support." }` | Account banned |

---

### OTP Flow Summary

```
App                          Server                      SSL Wireless
 |                              |                              |
 |-- POST /phone/send-otp ----> |                              |
 |   { phone: "017..." }        |-- POST /secure/otp-sms ----> |
 |                              |   AES-256-CBC + HMAC-SHA256  |
 |                              | <-- { status: "SUCCESS" } -- |
 | <-- { sent: true } --------- |                              |
 |                              |                              |
 |  [user reads SMS code]       |                              |
 |                              |                              |
 |-- POST /phone/verify-otp --> |                              |
 |   { phone, otp: "482931" }   |-- bcrypt.compare(otp_hash) --|
 |                              |-- find/create user           |
 | <-- { access_token, ... } -- |                              |
```

---

## Email / Password Login

```
POST /auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "userpassword"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600,
  "user_id": "uuid",
  "user": { "email": "user@example.com" }
}
```

**Errors:** `401` invalid credentials · `403` account deactivated

---

## Social Login — Google

```
POST /auth/social/google
```

**Request:**
```json
{ "id_token": "<Google ID token from SDK>" }
```

Use `id_token` (from Google Sign-In SDK) when available. Legacy `access_token` field also accepted.

**Response (200):** same shape as Phone OTP verify response above.

**Errors:** `401` invalid token · `403` account deactivated

---

## Social Login — Facebook

```
POST /auth/social/facebook
```

**Request:**
```json
{ "access_token": "<Facebook OAuth token>" }
```

**Response (200):** same shape as Phone OTP verify response above.

**Errors:** `400` missing token · `401` invalid token · `403` account deactivated

---

## Sign Up (Email)

```
POST /auth/signup
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "min6chars",
  "display_name": "John Doe"
}
```

**Response (201):**
```json
{ "message": "Signup successful. Please verify your email." }
```

**Errors:** `409` email already registered · `422` password too short

---

## Token Refresh

Access tokens expire in 7 days, refresh tokens in 30 days. Call this before an access token expires.

```
POST /auth/refresh
```

**Request:**
```json
{ "refresh_token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Response (200):**
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",
  "expires_in": 3600
}
```

---

## Get Current User

```
GET /auth/me
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "roles": ["user"],
  "profile": {
    "display_name": "John Doe",
    "avatar_url": "https://...",
    "phone": "8801712345678",
    "bio": null,
    "preferred_language": "bn",
    "is_active": true,
    "referral_code": "XY12Z9"
  }
}
```

---

## Logout

```
POST /auth/logout
Authorization: Bearer <access_token>
```

**Response (200):** `{ "message": "Logged out successfully" }`

> Tokens are stateless JWTs — logout is primarily client-side. Discard both `access_token` and `refresh_token` from storage on logout.

---

## Using the Token

All protected endpoints require:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**401** is returned when the token is missing or expired — trigger a refresh or re-login.

---

## OTP Security Details

| Property | Value |
| :--- | :--- |
| Code length | 6 digits |
| Expiry | 5 minutes |
| Storage | bcrypt hash (cost 10) — plaintext never stored |
| Rate limit | 1 OTP per 60 seconds per phone number |
| Transmission | SSL Wireless ISMS Plus `/secure/otp-sms` (AES-256-CBC + HMAC-SHA256) |
| Reuse | Each code is single-use — marked used on first successful verify |
