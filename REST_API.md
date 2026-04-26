# REST API

This project supports both:

- `tRPC` for the web app at `/trpc`
- `REST` for mobile clients at `/api/v1`

Base URL in local development:

```text
http://localhost:3001/api/v1
```

Base URL in staging:

```text
https://staging.boiaro.com/api/v1
```

## Authentication

Protected endpoints require:

```http
Authorization: Bearer <accessToken>
```

## Error format

Application errors:

```json
{
  "message": "Invalid email or password",
  "code": "UNAUTHORIZED"
}
```

Validation errors:

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

## Auth

### `POST /auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

Response:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "roles": ["user"],
    "profile": {
      "display_name": "User"
    }
  }
}
```

### `POST /auth/refresh`

Request:

```json
{
  "refreshToken": "jwt-refresh-token"
}
```

Response:

```json
{
  "accessToken": "new-access-token",
  "refreshToken": "new-refresh-token"
}
```

### `GET /auth/me`

Protected.

Response:

```json
{
  "id": "user_id",
  "email": "user@example.com",
  "roles": ["user"],
  "profile": {
    "display_name": "User"
  }
}
```

## Homepage and footer

### `GET /homepage`

Returns aggregated mobile home data. If the caller is authenticated, personalized sections such as `currentUser`, `continueReading`, and `continueListening` are included for that same user only.

Optional query params:

- `limit` number, optional, default `50`

### `GET /footer`

Returns footer/site setting data for mobile or web consumers.

Response shape:

```json
{
  "footerData": [
    {
      "key": "brand_name",
      "value": "BoiAro"
    }
  ]
}
```

## Profile

### `GET /profile`

Protected.

Response:

```json
{
  "userProfile": {
    "id": "user_id",
    "email": "user@example.com",
    "roles": [{ "role": "user" }],
    "profile": {
      "display_name": "User"
    },
    "created_at": "2026-01-01T00:00:00.000Z"
  }
}
```

### `PATCH /profile`

Protected.

Allowed request fields:

- `display_name`
- `full_name`
- `avatar_url`
- `bio`
- `preferred_language`

Example:

```json
{
  "display_name": "Akram",
  "bio": "Reader and writer"
}
```

Response:

```json
{
  "success": true,
  "message": "Profile updated"
}
```

## Books

### `GET /books`

List approved books.

Query params:

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

Example:

```http
GET /api/v1/books?limit=10&search=novel&isFeatured=true
```

Response:

```json
{
  "books": [],
  "nextCursor": "book_id"
}
```

### `GET /books/:id`

Get one approved book by database id.

### `GET /books/slug/:slug`

Get one approved book by slug.

Example:

```http
GET /api/v1/books/slug/দুর্গেশনন্দিনী-6945b4c0
```

### `GET /books/categories/list`

Get active categories.

Response:

```json
[
  {
    "id": "category_id",
    "name": "Fiction",
    "slug": "fiction"
  }
]
```

### `GET /books/:id/reviews`

Get approved reviews for a book.

Query params:

- `limit` number, optional, default `50`, max `100`

Response:

```json
[
  {
    "id": "review_id",
    "rating": 5,
    "comment": "Great book",
    "display_name": "Akram"
  }
]
```

### `POST /books/:id/reviews`

Protected.

Create or update the current user's review for a book. Existing reviews are updated and returned to `pending`.

Request:

```json
{
  "rating": 5,
  "comment": "Excellent read"
}
```

### `GET /books/:id/bookmark`

Protected.

Response:

```json
{
  "bookmarked": true
}
```

### `POST /books/:id/bookmark`

Protected.

Toggles bookmark state.

Response:

```json
{
  "bookmarked": true
}
```

## Me

### `GET /me/bookmarks`

Protected.

Returns the authenticated user's bookmarks with book summary data.

Response:

```json
[
  {
    "id": "bookmark_id",
    "book_id": "book_id",
    "book": {
      "id": "book_id",
      "title": "Book Name",
      "author": {
        "id": "author_id",
        "name": "Author Name"
      },
      "formats": [
        {
          "id": "format_id",
          "format": "ebook",
          "price": 120
        }
      ]
    }
  }
]
```

## Endpoint list

Current REST endpoints:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/homepage`
- `GET /api/v1/footer`
- `GET /api/v1/profile`
- `PATCH /api/v1/profile`
- `GET /api/v1/books`
- `GET /api/v1/books/:id`
- `GET /api/v1/books/slug/:slug`
- `GET /api/v1/books/categories/list`
- `GET /api/v1/books/:id/reviews`
- `POST /api/v1/books/:id/reviews`
- `GET /api/v1/books/:id/bookmark`
- `POST /api/v1/books/:id/bookmark`
- `GET /api/v1/me/bookmarks`
- `GET /api/v1/profile/roles`
- `GET /api/v1/categories`
- `GET /api/v1/authors?limit=20&offset=0`
- `GET /api/v1/ authors/{id}`
- `GET /api/v1/ narrators`


## Flutter notes

- Store `accessToken` and `refreshToken` securely
- Send `Authorization: Bearer <accessToken>` for protected endpoints
- If a protected request returns `401`, call `/auth/refresh` and retry
- Use `/books` for listing, `/books/slug/:slug` or `/books/:id` for detail screens
- Use `/books/:id/bookmark` and `/me/bookmarks` for save/bookmark flows


### `GET /profile/roles`

Protected.
Allowed request fields:

Authorization: Bearer your_token_here
Content-Type: application/json

Response:

```json
{
    "roles": [
        "user"
    ]
}
```


### `GET /categories`

Response:

```json
{
  "categories": [
    {
      "id": "cat-uuid",
      "name": "উপন্যাস",
      "name_bn": "উপন্যাস",
      "name_en": "Novel",
      "icon": "BookOpen",
      "color": "from-amber-50 to-orange-50",
      "slug": "novel",
      "is_featured": true,
      "is_trending": false,
      "priority": 1
    }
  ]
}
```


### `GET /authors?limit=20&offset=0`

Response:

```json
{
  "authors": [
    {
      "id": "68e91b04729e14c22e0e4ebe",
      "name": "Final Author",
      "name_en": "Final Author",
      "avatar_url": "/uploads/1760174074099-top-10-living-writers-of-the-world.webp",
      "bio": "<p>Testing Author</p>",
      "genre": null,
      "is_featured": false,
      "is_trending": false,
      "priority": 0
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### `GET /authors/{id}`

Success Response:

```json
{
    "id": "68e91b04729e14c22e0e4ebe",
    "name": "Final Author",
    "name_en": "Final Author",
    "avatar_url": "/uploads/1760174074099-top-10-living-writers-of-the-world.webp",
    "bio": "<p>Testing Author</p>",
    "genre": null,
    "is_featured": false,
    "is_trending": false
}
```

Error Response: 

```json
{
    "error": "Author not found"
}
```

### `GET /narrators`

Response:

```json
{
  "narrators": [
    {
      "id": "narrator-uuid",
      "name": "ফিউরেলা নূর পায়েল",
      "name_en": "Fiurella Noor Payel",
      "avatar_url": "https://example.com/avatar.jpg",
      "bio": "পেশাদার অডিওবুক বর্ণনাকারী...",
      "specialty": "Fiction, Drama",
      "rating": 4.8,
      "is_featured": true,
      "is_trending": false
    }
  ]
}
```