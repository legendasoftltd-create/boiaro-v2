import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";

export const shippingRouter = router({
  methods: publicProcedure
    .input(z.object({ districtId: z.string().optional() }).optional())
    .query(() =>
      prisma.shippingMethod.findMany({
        where: { is_active: true },
        orderBy: { base_cost: "asc" },
      })
    ),

  freeShipping: publicProcedure
    .input(z.object({ subtotal: z.number(), districtId: z.string().optional() }))
    .query(async ({ input }) => {
      const now = new Date();
      const campaign = await prisma.freeShippingCampaign.findFirst({
        where: {
          is_active: true,
          min_order_value: { lte: input.subtotal },
          start_date: { lte: now },
          OR: [{ end_date: null }, { end_date: { gte: now } }],
        },
        orderBy: { min_order_value: "desc" },
      });
      return campaign;
    }),

  calculate: publicProcedure
    .input(
      z.object({
        items: z.array(z.object({ weight: z.number().optional(), quantity: z.number() })),
        districtId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const method = await prisma.shippingMethod.findFirst({
        where: { is_active: true },
        orderBy: { base_cost: "asc" },
      });
      if (!method) return { cost: 0, method: null };

      const totalWeight = input.items.reduce(
        (sum, item) => sum + (item.weight ?? 0.5) * item.quantity,
        0
      );
      const cost = method.base_cost + totalWeight * method.per_kg_cost;
      return { cost, method };
    }),
});
