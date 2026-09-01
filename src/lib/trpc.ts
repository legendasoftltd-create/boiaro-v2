import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../server/src/routers/_app.js";
import { getAccessToken, getRefreshToken, getValidAccessToken, refreshSession } from "./authTokens";

export { type AppRouter };

export const trpc = createTRPCReact<AppRouter>();

// In production the server serves the frontend from the same origin, so /trpc works.
// In development Vite proxies /trpc → localhost:3001.
// Override with VITE_API_URL if the API lives on a separate origin.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * A batched request does not fail with 401.
 *
 * httpBatchLink packs several calls into one HTTP request, and when the
 * results disagree — one call unauthorized, another fine — tRPC answers 207
 * Multi-Status and puts each outcome in the body. Checking only
 * `res.status === 401` therefore missed exactly the case that happens most:
 * opening a new audiobook fires a burst of queries, some public and some
 * protected, which batch together. The session was never renewed, the
 * UNAUTHORIZED bubbled up to AuthContext, and the user was signed out
 * mid-playback.
 */
export async function batchCarriesAuthError(res: Response): Promise<boolean> {
  if (res.status !== 207) return false;
  try {
    const body = await res.clone().json();
    const items = Array.isArray(body) ? body : [body];
    return items.some((item) => {
      const data = item?.error?.data;
      return data?.httpStatus === 401 || data?.code === "UNAUTHORIZED";
    });
  } catch {
    // A body we cannot read is not evidence of an auth failure — never sign
    // anyone out over a parse error.
    return false;
  }
}

/**
 * Renew the session once and replay the request, instead of letting the
 * failure bubble up and sign the user out. Nothing here previously spent the
 * refresh token, so every session ended when its access token did.
 *
 * Only one refresh runs at a time (see refreshSession), and a request is only
 * ever replayed once — a second rejection after a successful refresh is a
 * genuine authorization failure and is allowed through.
 */
export const fetchWithRefresh: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!getRefreshToken()) return res;

  const rejected = res.status === 401 || (await batchCarriesAuthError(res));
  if (!rejected) return res;

  const renewed = await refreshSession();
  if (!renewed) return res;

  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE}/trpc`,
        fetch: fetchWithRefresh,
        // Renew *before* sending rather than waiting to be rejected. The
        // retry above is the safety net for a token that dies in flight;
        // this is what keeps the common case from ever becoming a 401.
        async headers() {
          const token = await getValidAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
