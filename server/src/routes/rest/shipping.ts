import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { BANGLADESH_DISTRICTS, isDhakaArea } from "../../data/bangladesh-districts.js";

export const shippingRestRouter = Router();

shippingRestRouter.get("/methods", async (req, res) => {
  try {
    const districtId = typeof req.query.districtId === "string" ? req.query.districtId : undefined;
    void districtId;

    const methods = await prisma.shippingMethod.findMany({
      where: { is_active: true },
      orderBy: { base_cost: "asc" },
    });

    res.json(methods);
  } catch (error) {
    sendHttpError(res, error);
  }
});

shippingRestRouter.get("/districts", async (_req, res) => {
  try {
    res.json({
      districts: BANGLADESH_DISTRICTS.map((name) => ({
        name,
        is_dhaka_area: isDhakaArea(name),
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
