import jwt from "jsonwebtoken";

export interface AuthUser {
  userId: string | null;
  userEmail: string | null;
}

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
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign(
    { sub: userId, email },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "30d" }
  );

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(refreshToken: string) {
  return jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
    sub: string;
    email: string;
  };
}
