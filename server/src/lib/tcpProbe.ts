import net from "net";

/**
 * Can this server open a TCP connection to host:port?
 *
 * Used to tell an admin whether a Facebook/YouTube ingest endpoint is
 * reachable from the broadcast host before they rely on it. Deliberately
 * proves only reachability — not that a stream key is accepted, which
 * nothing short of actually going live can establish.
 *
 * Never throws: a refused connection, a DNS failure and a timeout are all
 * just "not reachable" to the caller.
 */
export function probeTcp(host: string, port: number, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));

    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}
