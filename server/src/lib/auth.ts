import jwt from "jsonwebtoken";
import ms from "ms";

export interface AuthUser {
  userId: string | null;
  userEmail: string | null;
}

const ACCESS_TOKEN_EXPIRES_IN: jwt.SignOptions["expiresIn"] =
  (process.env.JWT_ACCESS_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"];
const REFRESH_TOKEN_EXPIRES_IN: jwt.SignOptions["expiresIn"] =
  (process.env.JWT_REFRESH_EXPIRES_IN ?? "30d") as jwt.SignOptions["expiresIn"];

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

export function signTokens(userId: string, email: string) {
  const accessToken = jwt.sign({ sub: userId, email }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
  const refreshToken = jwt.sign(
    { sub: userId, email },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(refreshToken: string) {
  return jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
    sub: string;
    email: string;
  };
}
