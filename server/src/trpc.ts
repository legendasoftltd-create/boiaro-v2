import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.js";

interface AppErrorCause {
  type?: string;
  limit?: number;
  devices?: unknown;
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause as AppErrorCause | undefined;
    if (cause?.type === "DEVICE_LIMIT_REACHED") {
      return {
        ...shape,
        data: { ...shape.data, appErrorCode: cause.type, deviceLimit: cause.limit, devices: cause.devices },
      };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
