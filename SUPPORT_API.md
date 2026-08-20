# Support Ticket — API List

All APIs for the support ticket system (`SupportTicket` + `TicketReply`): tRPC (web app) below. For the REST equivalents used by the mobile app, see [SUPPORT_MOBILE_API.md](./SUPPORT_MOBILE_API.md) — both now cover the full loop (create, list, view replies, reply, reopen-on-reply, push/in-app notification on staff reply).

Base URL: `{API_BASE}/trpc/{router}.{procedure}`

---

## 1. User-facing (`profiles` router)

### `profiles.createTicket`
**Type:** mutation
**Auth:** logged-in user

Input:
```json
{
  "subject": "Payment not received",
  "description": "I paid via bKash but my order still shows pending.",
  "category": "billing"
}
```
`category` is optional, defaults to `"general"`.

Creates a `SupportTicket` row with `status: "open"`, owned by the calling user. `priority` defaults to the user's active subscription plan's `support_priority` (`low`/`medium`/`high`/`urgent`), falling back to `"medium"` for users with no priority-support plan.

Response: the created `SupportTicket` row.

### `profiles.myTickets`
**Type:** query
**Auth:** logged-in user

No input. Returns the caller's own tickets, newest first, each with `ticket_number` and `replies_count`.

### `profiles.getTicketDetail`
**Type:** query
**Auth:** logged-in user

Input: `{ "ticketId": "<id>" }`

Returns the ticket plus its reply thread (`{ id, message, is_staff, created_at }[]`) — internal staff-only notes are filtered out. Throws `NOT_FOUND` if the ticket doesn't exist or isn't owned by the caller.

### `profiles.replyToTicket`
**Type:** mutation
**Auth:** logged-in user

Input: `{ "ticketId": "<id>", "message": "..." }`

Creates a `TicketReply` with `is_staff: false`. Replying to a `resolved`/`closed` ticket automatically reopens it (`status` → `open`).

---

## 2. Admin-facing (`admin` router)

### `admin.listSupportTickets`
**Type:** query
**Auth:** admin

No input. Returns every ticket, newest first, enriched with the submitter's name/email/phone and a reply count.

Response (array):
```json
[
  {
    "id": "uuid",
    "subject": "Payment not received",
    "description": "...",
    "category": "billing",
    "status": "open",
    "priority": "medium",
    "assigned_to": null,
    "resolved_at": null,
    "closed_at": null,
    "user_id": "uuid",
    "created_at": "...",
    "updated_at": "...",
    "ticket_number": "TKT-A1B2C3D4",
    "type": "ticket",
    "message": "...",
    "user_name": "John Doe",
    "user_email": "john@example.com",
    "user_phone": "+8801...",
    "replies_count": 3
  }
]
```

### `admin.getSupportTicketDetail`
**Type:** query
**Auth:** admin

Input: `{ "id": "<ticket_id>" }`

Same shape as one item from `listSupportTickets`, plus `attachment_url` (always `null` today — no attachment upload exists). Returns `null` if not found.

### `admin.listSupportTicketReplies`
**Type:** query
**Auth:** admin

Input: `{ "ticketId": "<ticket_id>" }`

Returns the thread for a ticket, oldest first. Staff replies prefixed with `[Internal] ` server-side are treated as internal notes — stripped from `message` and flagged via `is_internal: true` (not visible to the end user; there's no user-facing reply endpoint yet anyway, so this distinction only matters within the admin UI).

Response (array):
```json
[
  {
    "id": "uuid",
    "ticket_id": "uuid",
    "user_id": "uuid",
    "message": "We've refunded the order.",
    "is_staff": true,
    "is_admin": true,
    "is_internal": false,
    "sender_name": "Admin",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### `admin.updateSupportTicket`
**Type:** mutation
**Auth:** admin

Input:
```json
{
  "id": "<ticket_id>",
  "status": "resolved",
  "priority": "high",
  "assigned_to": "<admin_user_id>"
}
```
All fields except `id` are optional — only provided fields are updated. `status` is a free-form string (conventionally `open` / `in_progress` / `resolved` / `closed`); not enum-validated server-side. Setting `status: "resolved"` stamps `resolved_at`; `"closed"` stamps `closed_at`; moving back to `"open"`/`"in_progress"` clears both.

### `admin.addSupportTicketReply`
**Type:** mutation
**Auth:** admin

Input:
```json
{
  "ticketId": "<ticket_id>",
  "userId": "<admin_user_id>",
  "message": "We've refunded the order.",
  "isInternal": false
}
```
When `isInternal: true`, the message is stored prefixed with `[Internal] ` and filtered out of any user-visible thread view. Creates a `TicketReply` with `is_staff: true`. When *not* internal, the ticket owner is notified in-app + push (subject to their `support_enabled`/`push_enabled` preferences) via the shared `notifyUser` helper (`server/src/lib/notify.ts`), linking to `/support/tickets/:id`.

---

## 3. Remaining gaps

- **No attachment upload.** `attachment_url` exists in the admin detail response shape but is hardcoded `null` — no upload mutation/endpoint backs it.
- **No notification when a user replies** (only the reverse — staff reply → user notified). Whoever's `assigned_to` the ticket isn't proactively pinged; admins would need to check the support inbox themselves.
- **`type: "ticket"`** is present on every `listSupportTickets`/`getSupportTicketDetail` response but is always the same hardcoded value — there is no second ticket type. The admin UI's earlier "Complaints" tab/stat/badges that implied otherwise were dead code and have been removed (2026-08-20).
