import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../server/src/routers/_app.js";
import { getAccessToken, getRefreshToken, refreshSession } from "./authTokens";

export { type AppRouter };

export const trpc = createTRPCReact<AppRouter>();

// In production the server serves the frontend from the same origin, so /trpc works.
// In development Vite proxies /trpc → localhost:3001.
// Override with VITE_API_URL if the API lives on a separate origin.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * Renew the session once on a 401 and replay the request, instead of letting
 * the failure bubble up and sign the user out. Nothing here previously spent
 * the refresh token, so every session ended when its 7-day access token did.
 *
 * Only one refresh runs at a time (see refreshSession), and a request is only
 * ever replayed once — a second 401 after a successful refresh is a genuine
 * authorization failure and is allowed through.
 */
const fetchWithRefresh: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status !== 401 || !getRefreshToken()) return res;

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
        headers() {
          const token = getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
