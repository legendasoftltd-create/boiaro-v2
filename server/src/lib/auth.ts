import jwt from "jsonwebtoken";
import ms from "ms";
import { getRequestUserAgent } from "./requestContext.js";

export interface AuthUser {
  userId: string | null;
  userEmail: string | null;
}

// Short access token, long rotating refresh token — the standard split, and
// the reason the access token no longer needs a long life: the client renews
// silently on 401 (src/lib/authTokens.ts). It was 7d, which both delayed
// revocation and, before silent refresh existed, forced everyone to sign in
// again every week.
const ACCESS_TOKEN_EXPIRES_IN: jwt.SignOptions["expiresIn"] =
  (process.env.JWT_ACCESS_EXPIRES_IN ?? "1h") as jwt.SignOptions["expiresIn"];

/**
 * Refresh lifetime is the real session length, and it is an *inactivity*
 * window rather than a hard cap: every refresh issues a new token, so the
 * clock restarts each time the session is used. A user who opens the app
 * within the window stays signed in indefinitely.
 *
 * Native app sessions last longer than browser ones — a phone is a personal
 * device, a browser may be shared.
 */
const REFRESH_TTL_APP = process.env.JWT_REFRESH_EXPIRES_IN_APP ?? "90d";
const REFRESH_TTL_WEB = process.env.JWT_REFRESH_EXPIRES_IN ?? "30d";

const NATIVE_PLATFORMS = ["android", "ios", "capacitor", "app"];

/** True for the native app; anything else (or unknown) is treated as a browser. */
export function isNativePlatform(platform?: string | null): boolean {
  if (!platform) return false;
  const p = platform.toLowerCase();
  return NATIVE_PLATFORMS.some((n) => p.includes(n));
}

export function refreshTtlFor(platform?: string | null): string {
  return isNativePlatform(platform) ? REFRESH_TTL_APP : REFRESH_TTL_WEB;
}

// Actual access-token lifetime in seconds, for clients (e.g. the mobile app)
// that need to know when to refresh — kept in sync with ACCESS_TOKEN_EXPIRES_IN
// so it can never drift from the real JWT `exp` claim.
export const ACCESS_TOKEN_EXPIRES_IN_SECONDS =
  typeof ACCESS_TOKEN_EXPIRES_IN === "number"
    ? ACCESS_TOKEN_EXPIRES_IN
    : Math.floor(ms(ACCESS_TOKEN_EXPIRES_IN as Parameters<typeof ms>[0]) / 1000);

export function getAuthUserFromAuthorizationHeader(
  authorization?: string | null
): AuthUser {
  if (!authorization?.startsWith("Bearer ")) {
    return { userId: null, userEmail: null };
  }

  try {
    const token = authorization.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      email: string;
    };

    return {
      userId: payload.sub,
      userEmail: payload.email,
    };
  } catch {
    return { userId: null, userEmail: null };
  }
}

/**
 * The legacy Flutter app (User-Agent "Dart/…") does not renew on a 401. It
 * only ever worked because the access token used to last 7 days; shortening
 * it to 1h on 2026-08-30 started logging those users out every hour, and
 * production bore that out — 29,118 requests, 1,139 of them 401, just 21
 * refresh calls, and 42 forced re-logins in a single day.
 *
 * Until that app renews on 401, hand it the lifetime it was built against.
 * Every other client — web and the Capacitor app, which both refresh
 * correctly — keeps the short token. Delete this once the app is fixed.
 */
const LEGACY_APP_ACCESS_TOKEN_EXPIRES_IN =
  (process.env.JWT_ACCESS_EXPIRES_IN_LEGACY_APP ?? "7d") as jwt.SignOptions["expiresIn"];

export function isLegacyAppUserAgent(userAgent?: string | null): boolean {
  return /^Dart\//i.test((userAgent ?? "").trim());
}

export function accessTokenTtlFor(userAgent?: string | null): jwt.SignOptions["expiresIn"] {
  return isLegacyAppUserAgent(userAgent)
    ? LEGACY_APP_ACCESS_TOKEN_EXPIRES_IN
    : ACCESS_TOKEN_EXPIRES_IN;
}

export function signTokens(userId: string, email: string, platform?: string | null) {
  const accessToken = jwt.sign({ sub: userId, email }, process.env.JWT_SECRET!, {
    expiresIn: accessTokenTtlFor(getRequestUserAgent()),
  });
  const refreshToken = jwt.sign(
    { sub: userId, email, plt: isNativePlatform(platform) ? "app" : "web" },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: refreshTtlFor(platform) as jwt.SignOptions["expiresIn"] }
  );

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(refreshToken: string) {
  return jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
    sub: string;
    email: string;
    /** Which lifetime this session was issued under, so renewal keeps it. */
    plt?: "app" | "web";
    /** Issued-at, compared against User.sessions_valid_from on refresh. */
    iat?: number;
  };
}
