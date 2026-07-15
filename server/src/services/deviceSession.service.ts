import { prisma } from "../lib/prisma.js";
import { ACTIVE_SUBSCRIPTION_WHERE } from "./bookAccess.service.js";

/**
 * Per-plan device count limits. A device only ever counts against a user's
 * limit once it successfully logs in — token *refresh* never blocks (see
 * touchOrCreateDeviceSessionOnRefresh), it only keeps an existing session's
 * last_active_at current. Revoking a device frees a slot for future logins;
 * it does not invalidate that device's already-issued tokens (no per-device
 * JWT claim exists in this stateless-JWT setup).
 */

export interface DeviceSessionInfo {
  id: string;
  device_name: string | null;
  platform: string | null;
  last_active_at: Date;
}

export interface DeviceLoginParams {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  revokeDeviceId?: string;
}

export type DeviceLoginResult =
  | { allowed: true }
  | { allowed: false; limit: number; devices: DeviceSessionInfo[] };

// Resolves the effective device limit for a user from their currently-active
// subscription's plan. null = unlimited (no active subscription, or the
// plan's device_limit itself is null).
export async function getEffectiveDeviceLimit(userId: string): Promise<number | null> {
  const subscription = await prisma.userSubscription.findFirst({
    where: ACTIVE_SUBSCRIPTION_WHERE(userId),
    include: { plan: { select: { device_limit: true } } },
    orderBy: { created_at: "desc" },
  });
  return subscription?.plan.device_limit ?? null;
}

// Called from every sign-in path, after credentials/token verification
// succeeds but before new tokens are issued.
export async function resolveDeviceSessionOnLogin(
  userId: string,
  params: DeviceLoginParams
): Promise<DeviceLoginResult> {
  // Rollout rule: requests without a device id come from clients that don't
  // yet know about this feature (older app/web builds) — never enforce.
  if (!params.deviceId) return { allowed: true };

  if (params.revokeDeviceId) {
    await prisma.deviceSession.deleteMany({
      where: { id: params.revokeDeviceId, user_id: userId },
    });
  }

  const existing = await prisma.deviceSession.findUnique({
    where: { user_id_device_id: { user_id: userId, device_id: params.deviceId } },
  });
  if (existing) {
    // Known device re-logging in — never counts as a new slot.
    await prisma.deviceSession.update({
      where: { id: existing.id },
      data: {
        last_active_at: new Date(),
        device_name: params.deviceName ?? existing.device_name,
        platform: params.platform ?? existing.platform,
      },
    });
    return { allowed: true };
  }

  const limit = await getEffectiveDeviceLimit(userId);
  if (limit === null) {
    await prisma.deviceSession.create({
      data: {
        user_id: userId,
        device_id: params.deviceId,
        device_name: params.deviceName ?? null,
        platform: params.platform ?? null,
      },
    });
    return { allowed: true };
  }

  const currentDevices = await prisma.deviceSession.findMany({
    where: { user_id: userId },
    orderBy: { last_active_at: "desc" },
    select: { id: true, device_name: true, platform: true, last_active_at: true },
  });

  if (currentDevices.length < limit) {
    await prisma.deviceSession.create({
      data: {
        user_id: userId,
        device_id: params.deviceId,
        device_name: params.deviceName ?? null,
        platform: params.platform ?? null,
      },
    });
    return { allowed: true };
  }

  return { allowed: false, limit, devices: currentDevices };
}

// Called from the refresh path. Deliberately never blocks — failing a silent
// background refresh would kill an already-active session with no recovery
// path, which isn't what "block new logins over the limit" is meant to do.
export async function touchOrCreateDeviceSessionOnRefresh(
  userId: string,
  params: DeviceLoginParams
): Promise<void> {
  if (!params.deviceId) return;
  await prisma.deviceSession.upsert({
    where: { user_id_device_id: { user_id: userId, device_id: params.deviceId } },
    update: {
      last_active_at: new Date(),
      ...(params.deviceName !== undefined ? { device_name: params.deviceName } : {}),
      ...(params.platform !== undefined ? { platform: params.platform } : {}),
    },
    create: {
      user_id: userId,
      device_id: params.deviceId,
      device_name: params.deviceName ?? null,
      platform: params.platform ?? null,
    },
  });
}

export function listDeviceSessions(userId: string) {
  return prisma.deviceSession.findMany({
    where: { user_id: userId },
    orderBy: { last_active_at: "desc" },
  });
}

export async function revokeDeviceSession(userId: string, id: string): Promise<void> {
  await prisma.deviceSession.deleteMany({ where: { id, user_id: userId } });
}
