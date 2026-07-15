import { z } from "zod";

// Optional device-identifying fields, threaded through every sign-in/refresh
// path so device-count limits can be enforced per subscription plan. Absent
// on requests from clients that don't know about this feature yet — those
// requests always skip enforcement (see deviceSession.service.ts).
export const deviceInfoSchema = z.object({
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().max(200).optional(),
  platform: z.string().max(20).optional(),
  revokeDeviceId: z.string().optional(),
});

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
}).merge(deviceInfoSchema);

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
}).merge(deviceInfoSchema);
