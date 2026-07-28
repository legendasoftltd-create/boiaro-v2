import crypto from "crypto";

export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const PUBLIC_STUN: IceServerEntry[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const CREDENTIAL_TTL_SECONDS = 3600; // one show's worth; clients refetch per call anyway

/**
 * ICE server list for call-in WebRTC. Always includes public STUN; adds the
 * self-hosted coturn relay when TURN_SECRET/TURN_URLS are configured (they
 * are on production — a dev box without them just degrades to STUN-only).
 *
 * TURN credentials use coturn's `use-auth-secret` mechanism: username is a
 * unix expiry timestamp (optionally `:tag`-suffixed), password is
 * base64(HMAC-SHA1(secret, username)). Nothing is stored per-user and the
 * credential self-expires, so handing it to any authenticated client is safe.
 */
export function getCallInIceServers(userId?: string): IceServerEntry[] {
  const secret = process.env.TURN_SECRET;
  const urls = (process.env.TURN_URLS || "").split(",").map((u) => u.trim()).filter(Boolean);
  if (!secret || urls.length === 0) return PUBLIC_STUN;

  const expiry = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
  const username = userId ? `${expiry}:${userId}` : String(expiry);
  const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");

  return [...PUBLIC_STUN, { urls, username, credential }];
}
