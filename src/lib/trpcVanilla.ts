import { createTrpcClient } from "./trpc";

/**
 * A shared, non-hook tRPC client for imperative calls.
 *
 * Exists because several admin screens were calling
 * `utils.<procedure>.fetch(...)` on a **mutation**. React Query's utils only
 * knows how to *fetch* — it issues a GET — and tRPC answers a GET to a
 * mutation with 405 "Unsupported GET-request to mutation procedure". The
 * button appeared wired up and failed every time it was pressed.
 *
 * `.mutate()` here sends the POST those procedures actually require. Auth is
 * resolved per call inside createTrpcClient's `headers()`, so a module-level
 * instance is safe (the same pattern lib/emailService.ts already uses).
 */
export const trpcVanilla = createTrpcClient();
