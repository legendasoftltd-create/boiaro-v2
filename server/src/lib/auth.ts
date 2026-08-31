import jwt from "jsonwebtoken";
import ms from "ms";

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

export function signTokens(userId: string, email: string, platform?: string | null) {
  const accessToken = jwt.sign({ sub: userId, email }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
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
