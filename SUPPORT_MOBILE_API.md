# Support Ticket — Mobile App API Reference

REST endpoints for the support ticket system. These are the **only** APIs the mobile app needs to give users a full support experience: submit a ticket, see their own tickets, view replies, and reply back.

Base URL: `{API_BASE}/api/v1/support`
Auth: all endpoints require `Authorization: Bearer <access_token>` (logged-in user). State-changing calls (`POST`) also require the standard `X-Requested-With: XMLHttpRequest` header.

---

## 1. Create a ticket

**`POST /api/v1/support/tickets`**

Request body:
```json
{
  "subject": "Payment not received",
  "description": "I paid via bKash but my order still shows pending.",
  "category": "payment_issue"
}
```
`category` is optional (defaults to `"general"`). Suggested category values (free-form, not enforced): `payment_issue`, `book_access`, `audiobook_playback`, `subscription`, `refund`, `hardcopy_delivery`, `account`, `general`, `other`.

Response `200`:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "subject": "Payment not received",
  "description": "I paid via bKash but my order still shows pending.",
  "category": "payment_issue",
  "status": "open",
  "priority": "normal",
  "assigned_to": null,
  "closed_at": null,
  "resolved_at": null,
  "created_at": "2026-06-27T10:00:00.000Z",
  "updated_at": "2026-06-27T10:00:00.000Z",
  "ticket_number": "TKT-A1B2C3D4"
}
```

---

## 2. List my tickets

**`GET /api/v1/support/tickets`**

No body/params — always scoped to the authenticated user. Newest first.

Response `200`:
```json
{
  "tickets": [
    {
      "id": "uuid",
      "subject": "Payment not received",
      "description": "...",
      "category": "payment_issue",
      "status": "open",
      "priority": "normal",
      "created_at": "...",
      "updated_at": "...",
      "ticket_number": "TKT-A1B2C3D4",
      "replies_count": 2
    }
  ]
}
```
`status` values: `open` | `in_progress` | `resolved` | `closed`.

---

## 3. Ticket detail + reply thread

**`GET /api/v1/support/tickets/:id`**

Returns the ticket plus its full reply thread. Internal staff-only notes are filtered out server-side — never sent to this endpoint regardless.

Response `200`:
```json
{
  "id": "uuid",
  "subject": "Payment not received",
  "description": "I paid via bKash but my order still shows pending.",
  "category": "payment_issue",
  "status": "in_progress",
  "priority": "normal",
  "created_at": "...",
  "updated_at": "...",
  "ticket_number": "TKT-A1B2C3D4",
  "replies": [
    {
      "id": "uuid",
      "message": "We've refunded the order.",
      "is_staff": true,
      "created_at": "2026-06-27T11:00:00.000Z"
    },
    {
      "id": "uuid",
      "message": "Thank you, received it.",
      "is_staff": false,
      "created_at": "2026-06-27T11:05:00.000Z"
    }
  ]
}
```

Response `404` if the ticket doesn't exist or doesn't belong to the calling user:
```json
{ "success": false, "error": "NOT_FOUND", "message": "Ticket not found" }
```

---

## 4. Reply to a ticket

**`POST /api/v1/support/tickets/:id/reply`**

Request body:
```json
{ "message": "Still haven't received the refund, please check again." }
```

Replying to a ticket that's `resolved` or `closed` automatically reopens it (`status` → `open`) so staff see it again.

Response `200`:
```json
{
  "id": "uuid",
  "ticket_id": "uuid",
  "user_id": "uuid",
  "message": "Still haven't received the refund, please check again.",
  "is_staff": false,
  "created_at": "...",
  "updated_at": "..."
}
```

Response `404` (not your ticket / doesn't exist): same shape as §3.

---

## 5. Notifications

When staff reply (non-internal), the ticket owner automatically receives:
- an in-app notification (visible via the existing `GET /api/v1/notifications` endpoint), and
- a push notification — unless they've disabled push globally or specifically turned off the "support" notification category in their preferences.

The push payload's `data.link` field is `/support/tickets/{ticketId}` — on web this opens the ticket detail page directly; the mobile app should map that same link to its native ticket-detail screen when handling a tapped push notification.

No separate "mark ticket notification as read" call is needed — that's handled by the existing generic `POST /api/v1/notifications/read` endpoint.
