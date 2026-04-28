import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";

export const coinPackagesRestRouter = Router();

coinPackagesRestRouter.get("/", async (_req, res) => {
  try {
    const packages = await prisma.coinPackage.findMany({
      where: { is_active: true },
      orderBy: { sort_order: "asc" },
      select: { id: true, coins: true, price: true, bonus_coins: true, is_featured: true },
    });
    res.json({
      packages: packages.map((p) => ({
        id: p.id,
        coins: p.coins,
        price: p.price,
        bonus_coins: p.bonus_coins,
        is_popular: p.is_featured,
        is_best_value: false,
      })),
    });
  } catch (error) {
    sendHttpError(res, error);
  }
});
