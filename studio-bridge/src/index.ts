import "dotenv/config";
import { createServer } from "node:http";
// @ts-ignore — node-media-server ships no types
import NodeMediaServer from "node-media-server";
import { startBridge, stopBridge, registerMount, unregisterMount, activeBridgeCount } from "./bridge.js";
import { startFallbackLoop, stopFallbackLoop } from "./fallback.js";
import { syncStationMounts } from "./icecastConfig.js";

const RTMP_PORT = Number(process.env.RTMP_PORT || 1935);
const HTTP_PORT = Number(process.env.NMS_HTTP_PORT || 8888);
const INTERNAL_PORT = Number(process.env.BRIDGE_INTERNAL_PORT || 8899);
const INTERNAL_SECRET = process.env.STUDIO_BRIDGE_INTERNAL_SECRET || "";

const nms = new NodeMediaServer({
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: HTTP_PORT,
    allow_origin: "*",
  },
  logType: 2,
});

// Fired once Egress (or any RTMP publisher) starts pushing a stream —
// StreamPath looks like "/live/<stream-key>".
nms.on("postPublish", (_id: string, streamPath: string) => {
  console.log(`[nms] publish started: ${streamPath}`);
  startBridge(streamPath);
});

nms.on("donePublish", (_id: string, streamPath: string) => {
  console.log(`[nms] publish ended: ${streamPath}`);
  stopBridge(streamPath);
  unregisterMount(streamPath);
});

nms.run();

// Internal control channel — the app server calls these. Same shared-secret
// auth as the reverse "master-ready" webhook in bridge.ts.
//   POST /internal/register-mount  — right before Egress starts publishing,
//     which Icecast mount this specific broadcast should land on (see
//     server/src/routers/studio.ts's startBroadcast).
//   POST /internal/sync-stations   — after any RadioStation is added,
//     edited, or (de)activated, the full current list of station mounts,
//     so Icecast's per-mount fallback wiring stays current (icecastConfig.ts).
function readJsonBody(req: import("node:http").IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
    });
  });
}

const internalServer = createServer(async (req, res) => {
  if (req.method !== "POST" || !(req.url === "/internal/register-mount" || req.url === "/internal/sync-stations")) {
    res.writeHead(404).end();
    return;
  }
  if (!INTERNAL_SECRET || req.headers["x-studio-internal-secret"] !== INTERNAL_SECRET) {
    res.writeHead(401).end();
    return;
  }

  try {
    const payload = await readJsonBody(req);

    if (req.url === "/internal/register-mount") {
      const { streamPath, mount } = payload;
      if (typeof streamPath !== "string" || !streamPath || typeof mount !== "string" || !mount) {
        res.writeHead(400).end();
        return;
      }
      registerMount(streamPath, mount);
      console.log(`[bridge] registered mount ${mount} for ${streamPath}`);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
      return;
    }

    // /internal/sync-stations
    const { mounts } = payload;
    if (!Array.isArray(mounts) || !mounts.every((m) => typeof m === "string")) {
      res.writeHead(400).end();
      return;
    }
    await syncStationMounts(mounts);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
  } catch (err: any) {
    console.error(`[bridge] ${req.url} failed:`, err.message);
    res.writeHead(500).end();
  }
});
// Defaults to loopback-only (safe when the app server is colocated, e.g.
// local dev). When the app server runs on a different host than the
// bridge, set BRIDGE_INTERNAL_HOST=0.0.0.0 and firewall the port to just
// that host's IP (shared-secret auth on the endpoint itself is the other
// half of the protection, not a substitute for the firewall rule).
const INTERNAL_HOST = process.env.BRIDGE_INTERNAL_HOST || "127.0.0.1";
internalServer.listen(INTERNAL_PORT, INTERNAL_HOST, () => {
  console.log(`[studio-bridge] internal control channel listening on ${INTERNAL_HOST}:${INTERNAL_PORT}`);
});

console.log(`[studio-bridge] RTMP ingest listening on :${RTMP_PORT}, HTTP on :${HTTP_PORT}`);
console.log(`[studio-bridge] Egress should push to rtmp://<this-host>:${RTMP_PORT}/live/<key>`);

startFallbackLoop();

setInterval(() => {
  console.log(`[studio-bridge] heartbeat — active bridges: ${activeBridgeCount()}`);
}, 30_000).unref();

function shutdown() {
  stopFallbackLoop();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
