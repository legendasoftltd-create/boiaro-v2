import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../server/src/routers/index.js";

export { type AppRouter };

export const trpc = createTRPCReact<AppRouter>();

// In production the server serves the frontend from the same origin, so /trpc works.
// In development Vite proxies /trpc → localhost:3001.
// Override with VITE_API_URL if the API lives on a separate origin.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE}/trpc`,
        headers() {
          const token = localStorage.getItem("access_token");
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
