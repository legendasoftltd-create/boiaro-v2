import { readFile, writeFile } from "node:fs/promises";

/**
 * Keeps Icecast's per-mount emergency-fallback wiring in sync with the
 * platform's actual (admin-managed, dynamic) station list. Icecast only
 * applies <fallback-mount> to mounts it has a declared <mount> stanza for —
 * there's no wildcard/pattern config for "any mount falls back to X" — so
 * every station's mount needs its own stanza, regenerated whenever stations
 * change (see server/src/lib/studioBridge.ts's syncStationMountsWithBridge,
 * called from the admin station mutations and once at server boot).
 *
 * Rather than a full XML parse/rewrite (a new dependency, more ways to
 * mangle a file Icecast needs to boot from), this does a targeted text
 * replace between two marker comments in icecast.xml — everything else in
 * the file (the fixed /fallback.mp3 mount, limits, auth, ports) is left
 * untouched.
 */
const XML_PATH = process.env.ICECAST_XML_PATH || "./icecast/icecast.xml";
const ICECAST_HOST = process.env.ICECAST_HOST || "localhost";
const ICECAST_PORT = process.env.ICECAST_PORT || "8000";
const ICECAST_ADMIN_USER = process.env.ICECAST_ADMIN_USER || "admin";
const ICECAST_ADMIN_PASSWORD = process.env.ICECAST_ADMIN_PASSWORD || "";
const FALLBACK_MOUNT = process.env.ICECAST_FALLBACK_MOUNT || "/fallback.mp3";

const START_MARKER = "<!-- DYNAMIC_MOUNTS_START (managed by icecastConfig.ts — do not edit by hand) -->";
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

async function reloadIcecast(): Promise<void> {
  const auth = Buffer.from(`${ICECAST_ADMIN_USER}:${ICECAST_ADMIN_PASSWORD}`).toString("base64");
  const res = await fetch(`http://${ICECAST_HOST}:${ICECAST_PORT}/admin/reloadconfig`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Icecast reloadconfig returned ${res.status}`);
}

/**
 * Regenerates the dynamic mount block from the given list of station
 * mounts (deduped by the caller) and hot-reloads Icecast to pick it up. A
 * no-op (including no reload) if the regenerated block is identical to
 * what's already on disk, so routine syncs with no actual station changes
 * don't reload Icecast for nothing.
 */
export async function syncStationMounts(mounts: string[]): Promise<void> {
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
    console.log(`[icecastConfig] no change for ${unique.length} station mount(s), skipping reload`);
    return;
  }

  await writeFile(XML_PATH, next, "utf8");
  await reloadIcecast();
  console.log(`[icecastConfig] synced ${unique.length} station mount(s) and reloaded Icecast`);
}
