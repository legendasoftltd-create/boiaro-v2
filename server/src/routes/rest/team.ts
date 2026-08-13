import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";

export const teamRestRouter = Router();

// GET /team — active team members, in display order — mirrors tRPC books.teamMembers
teamRestRouter.get("/", async (_req, res) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { status: "active" },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
    res.json(members);
  } catch (error) {
    sendHttpError(res, error);
  }
});
