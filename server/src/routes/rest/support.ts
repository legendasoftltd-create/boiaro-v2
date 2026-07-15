import { Router } from "express";
import { z } from "zod";
import { sendHttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { getActiveSubscriptionPlanOverrides } from "../../services/bookAccess.service.js";

export const supportRestRouter = Router();

const ticketNumber = (id: string) => `TKT-${id.slice(0, 8).toUpperCase()}`;

const createTicketSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
});

// ── POST /api/v1/support/tickets ─────────────────────────────────────────────
supportRestRouter.post("/tickets", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const input = createTicketSchema.parse(req.body);
    const subscription = await getActiveSubscriptionPlanOverrides(req.auth.userId!);
    const ticket = await prisma.supportTicket.create({
      data: {
        user_id: req.auth.userId!,
        subject: input.subject,
        description: input.description,
        category: input.category || "general",
        status: "open",
        ...(subscription?.support_priority ? { priority: subscription.support_priority } : {}),
      },
    });
    res.json({ ...ticket, ticket_number: ticketNumber(ticket.id) });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/support/tickets ───────────────────────────────────────────────
// Returns the authenticated user's own tickets, newest first.
supportRestRouter.get("/tickets", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { user_id: req.auth.userId! },
      orderBy: { created_at: "desc" },
      include: { replies: { select: { id: true } } },
    });
    res.json({
      tickets: tickets.map((t) => ({
        ...t,
        ticket_number: ticketNumber(t.id),
        replies_count: t.replies.length,
        replies: undefined,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

// ── GET /api/v1/support/tickets/:id ───────────────────────────────────────────
// Ticket detail + its reply thread (internal staff notes are stripped out).
supportRestRouter.get("/tickets/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: String(req.params.id), user_id: req.auth.userId! },
    });
    if (!ticket) {
      res.status(404).json({ success: false, error: "NOT_FOUND", message: "Ticket not found" });
      return;
    }

    const replies = await prisma.ticketReply.findMany({
      where: { ticket_id: ticket.id },
      orderBy: { created_at: "asc" },
    });

    res.json({
      ...ticket,
      ticket_number: ticketNumber(ticket.id),
      replies: replies
        .filter((r) => !(r.is_staff && r.message.startsWith("[Internal] ")))
        .map((r) => ({
          id: r.id,
          message: r.message,
          is_staff: r.is_staff,
          created_at: r.created_at,
        })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});

const replySchema = z.object({ message: z.string().min(1) });

// ── POST /api/v1/support/tickets/:id/reply ────────────────────────────────────
// User follow-up on their own ticket. Reopens a resolved/closed ticket.
supportRestRouter.post("/tickets/:id/reply", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const input = replySchema.parse(req.body);
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: String(req.params.id), user_id: req.auth.userId! },
    });
    if (!ticket) {
      res.status(404).json({ success: false, error: "NOT_FOUND", message: "Ticket not found" });
      return;
    }

    const reply = await prisma.ticketReply.create({
      data: {
        ticket_id: ticket.id,
        user_id: req.auth.userId!,
        message: input.message,
        is_staff: false,
      },
    });

    if (ticket.status === "resolved" || ticket.status === "closed") {
      await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "open" } });
    }

    res.json(reply);
  } catch (error) {
    sendHttpError(res, error);
  }
});
