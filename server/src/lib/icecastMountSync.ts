import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Keeps the REAL, listener-facing Icecast's per-mount emergency-fallback
 * wiring in sync with the platform's actual (admin-managed, dynamic)
 * station list, plus the Studio bridge's fixed default mount.
 *
 * This used to be the Bridge Relay's job (studio-bridge/src/icecastConfig.ts,
 * still present but no longer called from here) — that made sense back when
 * the bridge ran its own local Icecast that also served real listeners. It
 * doesn't anymore: the bridge now pushes to THIS host's Icecast (see
 * project memory studio-bridge-icecast-routing-2026-08-16), so the mount
 * config that actually matters lives here, on the same host as this server,
 * not on the remote bridge host. Managing it locally also means one fewer
 * cross-host network dependency for something that's now a same-host file
 * write.
 *
 * Icecast only applies <fallback-mount> to mounts it has a declared <mount>
 * stanza for — there's no wildcard "any mount falls back to X" config — so
 * every station's mount needs its own stanza, regenerated whenever stations
 * change. Uses the same targeted marker-based text replace as the bridge's
 * original implementation (a full XML parse/rewrite would be a new
 * dependency and more ways to mangle a file Icecast needs to boot from).
 */
const XML_PATH = process.env.ICECAST_XML_PATH || "/etc/icecast2/icecast.xml";
const FALLBACK_MOUNT = process.env.ICECAST_STUDIO_FALLBACK_MOUNT || "/studio-fallback.mp3";

const START_MARKER = "<!-- DYNAMIC_MOUNTS_START (managed by icecastMountSync.ts — do not edit by hand) -->";
const END_MARKER = "<!-- DYNAMIC_MOUNTS_END -->";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMountStanza(mount: string): string {
  const safe = escapeXml(mount);
  return [
    `    <mount type="normal">`,
    `        <mount-name>${safe}</mount-name>`,
    `        <public>0</public>`,
    `        <fallback-mount>${escapeXml(FALLBACK_MOUNT)}</fallback-mount>`,
    `        <fallback-override>1</fallback-override>`,
    `    </mount>`,
  ].join("\n");
}

// Icecast has no HTTP admin command for a live config reload — it re-reads
// its config file on SIGHUP, which `systemctl reload icecast2` (native
// install, unlike the bridge's docker-compose one) delivers without
// dropping connections on unrelated mounts.
async function reloadIcecast(): Promise<void> {
  await execFileAsync("systemctl", ["reload", "icecast2"]);
}

/**
 * Regenerates the dynamic mount block from the given list of station mounts
 * (deduped by the caller) and hot-reloads Icecast to pick it up. A no-op
 * (including no reload) if the regenerated block is identical to what's
 * already on disk. Best-effort by design (caller catches) — a broadcast's
 * own ability to go live never depends on this having succeeded, only its
 * dead-air fallback protection does.
 */
export async function syncStudioIcecastMounts(mounts: string[]): Promise<void> {
  const xml = await readFile(XML_PATH, "utf8");
  const startIdx = xml.indexOf(START_MARKER);
  const endIdx = xml.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`icecast.xml at ${XML_PATH} is missing the DYNAMIC_MOUNTS markers`);
  }

  const unique = [...new Set(mounts)].filter((m) => m && m !== FALLBACK_MOUNT);
  const block = unique.length ? unique.map(renderMountStanza).join("\n") + "\n" : "";
  const next = xml.slice(0, startIdx + START_MARKER.length) + "\n" + block + xml.slice(endIdx);

  if (next === xml) {
    console.log(`[icecastMountSync] no change for ${unique.length} station mount(s), skipping reload`);
    return;
  }

  await writeFile(XML_PATH, next, "utf8");
  await reloadIcecast();
  console.log(`[icecastMountSync] synced ${unique.length} station mount(s) and reloaded Icecast`);
}
