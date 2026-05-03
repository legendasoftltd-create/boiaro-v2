import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { prisma } from "../lib/prisma.js";
import * as redx from "../services/redx.service.js";

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

  redx: router({
    areas: publicProcedure
      .input(z.object({ post_code: z.string().optional(), district_name: z.string().optional() }).optional())
      .query(({ input }) => redx.getAreas(input)),

    trackParcel: publicProcedure
      .input(z.object({ parcel_id: z.string() }))
      .query(({ input }) => redx.trackParcel(input.parcel_id)),

    parcelInfo: publicProcedure
      .input(z.object({ tracking_id: z.string() }))
      .query(({ input }) => redx.getParcelInfo(input.tracking_id)),

    createParcel: publicProcedure
      .input(
        z.object({
          customer_name: z.string(),
          customer_phone: z.string(),
          delivery_area: z.string(),
          delivery_area_id: z.number().int(),
          customer_address: z.string(),
          cash_collection_amount: z.string(),
          parcel_weight: z.string(),
          merchant_invoice_id: z.string().optional(),
          instruction: z.string().optional(),
          value: z.string(),
          pickup_store_id: z.number().int().optional(),
          parcel_details_json: z
            .array(z.object({ name: z.string(), category: z.string(), value: z.number() }))
            .optional(),
        })
      )
      .mutation(({ input }) =>
        redx.createParcel({
          customer_name: input.customer_name,
          customer_phone: input.customer_phone,
          delivery_area: input.delivery_area,
          delivery_area_id: input.delivery_area_id,
          customer_address: input.customer_address,
          cash_collection_amount: input.cash_collection_amount,
          parcel_weight: input.parcel_weight,
          merchant_invoice_id: input.merchant_invoice_id,
          instruction: input.instruction,
          value: input.value,
          pickup_store_id: input.pickup_store_id,
          parcel_details_json: input.parcel_details_json as
            | Array<{ name: string; category: string; value: number }>
            | undefined,
        })
      ),

    cancelParcel: publicProcedure
      .input(z.object({ tracking_id: z.string(), reason: z.string().optional() }))
      .mutation(({ input }) => redx.cancelParcel(input.tracking_id, input.reason)),

    pickupStores: publicProcedure.query(() => redx.getPickupStores()),

    pickupStore: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ input }) => redx.getPickupStore(input.id)),

    createPickupStore: publicProcedure
      .input(
        z.object({
          name: z.string(),
          phone: z.string(),
          address: z.string(),
          area_id: z.number().int(),
        })
      )
      .mutation(({ input }) =>
        redx.createPickupStore({
          name: input.name,
          phone: input.phone,
          address: input.address,
          area_id: input.area_id,
        })
      ),

    calculateCharge: publicProcedure
      .input(
        z.object({
          delivery_area_id: z.number().int(),
          pickup_area_id: z.number().int(),
          cash_collection_amount: z.number(),
          weight: z.number(),
        })
      )
      .query(({ input }) =>
        redx.calculateCharge({
          delivery_area_id: input.delivery_area_id,
          pickup_area_id: input.pickup_area_id,
          cash_collection_amount: input.cash_collection_amount,
          weight: input.weight,
        })
      ),
  }),
});
