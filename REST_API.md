# REST API

This server now supports both:

- `tRPC` for the web app at `/trpc`
- `REST` for mobile clients at `/api/v1`

The REST endpoints below reuse the same core service logic as the matching tRPC procedures, so web and mobile stay aligned.

Base URL in local development:

```text
http://localhost:3001/api/v1
```

Base ULR in production:

```test
https://stating.boiaro.com/api/v1
```

## Authentication

Protected endpoints require a bearer token:

```http
Authorization: Bearer <accessToken>
```

Access and refresh tokens are returned by the login endpoint.

## Error Format

REST endpoints return JSON errors in this shape:

```json
{
  "message": "Invalid email or password",
  "code": "UNAUTHORIZED"
}
```

Validation errors return:

```json
{
  "message": "Validation failed",
  "issues": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Invalid email"]
    }
  }
}
```

## Endpoints

### `POST /auth/login`

Authenticate a user with email and password.

Request body:

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

Success response:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "user": {
    "id": "clx123",
    "email": "user@example.com",
    "roles": ["user"],
    "profile": {
      "id": "profile_1",
      "display_name": "User",
      "avatar_url": null
    }
  }
}
```

Possible errors:

- `401 UNAUTHORIZED` if credentials are invalid
- `403 FORBIDDEN` if the account is deleted or inactive
- `400 BAD_REQUEST` if the request body is invalid

### `POST /auth/refresh`

Exchange a refresh token for a new access token pair.

Request body:

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

Success response:

```json
{
  "accessToken": "new-access-token",
  "refreshToken": "new-refresh-token"
}
```

Possible errors:

- `401 UNAUTHORIZED` if the refresh token is invalid
- `400 BAD_REQUEST` if the request body is invalid

### `GET /auth/me`

Get the currently authenticated user.

Headers:

```http
Authorization: Bearer <accessToken>
```

Success response:

```json
{
  "id": "clx123",
  "email": "user@example.com",
  "roles": ["user"],
  "profile": {
    "id": "profile_1",
    "display_name": "User",
    "avatar_url": null
  }
}
```

Possible errors:

- `401 UNAUTHORIZED` if the token is missing or invalid
- `404 NOT_FOUND` if the user no longer exists

### `GET /books`

List approved books with optional filters.

Query parameters:

- `limit` number, optional, default `20`, max `100`
- `cursor` string, optional
- `categoryId` string, optional
- `search` string, optional
- `isFeatured` boolean, optional
- `isBestseller` boolean, optional
- `isFree` boolean, optional
- `language` string, optional
- `authorId` string, optional
- `publisherId` string, optional

Example request:

```http
GET /api/v1/books?limit=10&search=novel&isFeatured=true
```

Success response:

```json
{
  "books": [
    {
      "id": "book_1",
      "title": "Example Book",
      "title_en": "Example Book",
      "author": {
        "id": "author_1",
        "name": "Author Name",
        "name_en": "Author Name",
        "avatar_url": null,
        "bio": null,
        "genre": null,
        "is_featured": false
      },
      "publisher": {
        "id": "publisher_1",
        "name": "Publisher Name",
        "name_en": "Publisher Name",
        "logo_url": null,
        "description": null,
        "is_verified": true
      },
      "category": {
        "id": "category_1",
        "name": "Fiction",
        "name_bn": "Fiction",
        "slug": "fiction",
        "icon": null,
        "color": null
      },
      "formats": [
        {
          "id": "format_1",
          "format": "ebook",
          "price": 120,
          "original_price": 150,
          "discount": 20,
          "coin_price": null,
          "pages": 220,
          "duration": null,
          "in_stock": true,
          "is_available": true,
          "narrator_id": null,
          "binding": null,
          "audio_quality": null,
          "file_size": null,
          "chapters_count": null,
          "preview_chapters": null,
          "dimensions": null,
          "weight": null,
          "delivery_days": null,
          "stock_count": null
        }
      ]
    }
  ],
  "nextCursor": "book_10"
}
```

Notes:

- If there are no more records, `nextCursor` is omitted or `null`
- Use `cursor` from the previous response to fetch the next page

Possible errors:

- `400 BAD_REQUEST` if any query parameter has an invalid type or value

### `GET /books/:id`

Fetch one book by database id.

Path params:

- `id` string, required

Example request:

```http
GET /api/v1/books/book_1
```

Success response:

```json
{
  "id": "book_1",
  "title": "Example Book",
  "description": "Book description",
  "author": {
    "id": "author_1",
    "name": "Author Name"
  },
  "publisher": {
    "id": "publisher_1",
    "name": "Publisher Name"
  },
  "category": {
    "id": "category_1",
    "name": "Fiction"
  },
  "formats": [
    {
      "id": "format_1",
      "format": "audiobook",
      "narrator": {
        "id": "narrator_1",
        "name": "Narrator Name",
        "avatar_url": null
      }
    }
  ]
}
```

Possible errors:

- `404 NOT_FOUND` if the book does not exist

## Flutter Notes

- Store `accessToken` and `refreshToken` securely
- Send `Authorization: Bearer <accessToken>` for protected endpoints
- If a protected request returns `401`, call `/auth/refresh` and retry
- Use `/books` for list screens and `/books/:id` for details screens

## Current Scope

The first REST endpoints added are:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/books`
- `GET /api/v1/books/:id`
- `GET /api/v1/homepage`
- `GET /api/v1/footer`
- `GET /api/v1/profile`

More endpoints can be added gradually using the same pattern without affecting the existing web tRPC client.


## Fetch Homepage Data. Example request:

`GET /api/v1/homepage`

method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    userId
  },

Current `homepage` Response Structure:
{
  currentUser{},
  continueListening[],
  continueReading[],
  radio: {
      station,
      liveSession
  },
  popularBooks[],
  BecauseYouRead[],
  "editorsPick": [],
  "appDownload": [],
  "trendingNow": {},
  "popularAudiobooks": [],
  "popularHardCopies": [],
  "popularEbooks": [],
  "topTenMostRead": [],
  "slider": {},
  "allCategory": [],
  "allAuthor": [],
  "allNarrators": [],
  "countsValue": {},
  "NewReleases": {},
  "FreeBooks": []
}


## Fetch Footer Data. Example request:

`GET /api/v1/footer`

Current `homepage` Response Structure:
{
  "footerData"[]
}

## Fetch User Profile Data. Example request:

`GET /api/v1/profile`

method: "GET",
headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_TOKEN_HERE"
}

Current `profile` Response Structure:
{
  "userProfile"{}
}