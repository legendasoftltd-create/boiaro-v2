import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.js";
import { logSystemError } from "./lib/systemLog.js";

interface AppErrorCause {
  type?: string;
  limit?: number;
  devices?: unknown;
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    // Only the "we didn't expect this" bucket — tRPC wraps any non-TRPCError
    // throw into INTERNAL_SERVER_ERROR before this runs, so this is the same
    // signal as a REST 500, not the routine 400/401/404/409s.
    if (error.code === "INTERNAL_SERVER_ERROR") {
      logSystemError("trpc", error.cause ?? error).catch(() => null);
    }
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
