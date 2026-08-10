import "dotenv/config";
import { AccessToken } from "livekit-server-sdk";

/**
 * Dev-only CLI for Phase 1 testing: mints a LiveKit join token directly.
 * Usage: npm run mint-token -- <room> <identity>
 * Superseded in Phase 2 by the real room-lifecycle/RBAC design — this
 * exists purely to drive local verification (livekit-cli test publishers,
 * the throwaway test-harness.html) without standing up the full app.
 */
async function main() {
  const [room, identity] = process.argv.slice(2);
  if (!room || !identity) {
    console.error("Usage: npm run mint-token -- <room> <identity>");
    process.exit(1);
  }

  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";

  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

  const token = await at.toJwt();
  console.log(token);
}

main();
