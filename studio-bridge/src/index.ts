import "dotenv/config";
// @ts-ignore — node-media-server ships no types
import NodeMediaServer from "node-media-server";
import { startBridge, stopBridge, activeBridgeCount } from "./bridge.js";
import { startFallbackLoop, stopFallbackLoop } from "./fallback.js";

const RTMP_PORT = Number(process.env.RTMP_PORT || 1935);
const HTTP_PORT = Number(process.env.NMS_HTTP_PORT || 8888);

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
});

nms.run();

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
