/**
 * Access/refresh token storage and renewal.
 *
 * The refresh token was issued at sign-in and stored, but nothing ever spent
 * it: there was no refresh call anywhere in the client. So once the 7-day
 * access token expired, the next request 401'd and the user was signed out —
 * on web and in the app alike — even though a valid 30-day refresh token was
 * sitting in localStorage the whole time.
 */

const ACCESS = "access_token";
const REFRESH = "refresh_token";

// Must match the base used by the tRPC client.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const getAccessToken = () => localStorage.getItem(ACCESS);
export const getRefreshToken = () => localStorage.getItem(REFRESH);

export function setTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(ACCESS, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

/** In-flight refresh, so a burst of 401s triggers one renewal rather than N. */
let inFlight: Promise<boolean> | null = null;

/**
 * Exchange the refresh token for a new pair. Resolves true when the session
 * was renewed. Returns false — and clears both tokens — only when the server
 * actually rejects the refresh token; a network failure leaves them alone so a
 * transient blip can't sign anyone out.
 */
export function refreshSession(): Promise<boolean> {
  if (inFlight) return inFlight;

  const attempt = (async () => {
    const refresh_token = getRefreshToken();
    if (!refresh_token) return false;
    try {
      // Device info rides along so the refresh keeps the device session's
      // last-seen time current (that session is what the plan's device limit
      // counts) and so the renewed token keeps the platform's own lifetime.
      let device: Record<string, string> = {};
      try {
        const [{ getOrCreateDeviceId, getDeviceDisplayInfo }] = await Promise.all([
          import("./deviceId"),
        ]);
        const info = await getDeviceDisplayInfo();
        device = { deviceId: await getOrCreateDeviceId(), deviceName: info.deviceName, platform: info.platform };
      } catch {
        // Device details are an optimisation, never a precondition for renewal.
      }

      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "boiaro-web" },
        body: JSON.stringify({ refresh_token, ...device }),
      });
      if (res.status >= 400 && res.status < 500) {
        // The refresh token itself is bad or expired — this is a real sign-out.
        clearTokens();
        return false;
      }
      if (!res.ok) return false; // 5xx / upstream blip — keep the tokens, try again later
      const data = await res.json();
      if (!data?.access_token) return false;
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      // Offline or DNS failure — emphatically not a reason to sign someone out.
      return false;
    }
  })();

  inFlight = attempt;
  // Cleared only after the assignment above, and only if this is still the
  // current attempt. Clearing inside the async body instead would run *before*
  // the assignment whenever the body finishes synchronously (e.g. no refresh
  // token), leaving a settled promise cached forever and silently disabling
  // every future refresh.
  void attempt.finally(() => {
    if (inFlight === attempt) inFlight = null;
  });

  return attempt;
}

/** Seconds of remaining life below which a token is treated as already expired. */
const EXPIRY_SKEW_SECONDS = 60;

function secondsUntilExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof claims?.exp !== "number") return null;
    return claims.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

/**
 * An access token that is actually usable right now, renewing first if the
 * current one has expired or is about to.
 *
 * Anything that hands the token to a long-lived connection must use this
 * rather than reading localStorage directly. The realtime socket sends the
 * token once at handshake and the server rejects an expired one outright, so
 * a stale read there silently kills chat and call-in until a reload.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;
  const left = secondsUntilExpiry(token);
  if (left !== null && left <= EXPIRY_SKEW_SECONDS) {
    await refreshSession();
    return getAccessToken();
  }
  return token;
}

/** True when an error means "your session is no longer valid", not "the network hiccuped". */
export function isAuthError(err: unknown): boolean {
  const e = err as any;
  return (
    e?.data?.code === "UNAUTHORIZED" ||
    e?.data?.httpStatus === 401 ||
    e?.shape?.data?.httpStatus === 401 ||
    /unauthorized/i.test(String(e?.message ?? ""))
  );
}
