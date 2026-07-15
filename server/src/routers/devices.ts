import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { listDeviceSessions, revokeDeviceSession } from "../services/deviceSession.service.js";

export const devicesRouter = router({
  myDevices: protectedProcedure.query(({ ctx }) => listDeviceSessions(ctx.userId!)),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => revokeDeviceSession(ctx.userId!, input.id)),
});
