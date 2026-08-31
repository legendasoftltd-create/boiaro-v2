import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWakeLock } from "@/hooks/useWakeLock";

/**
 * A sleeping phone screen throttles timers and suspends audio, so the RJ
 * client stops heartbeating and the server ends the session as a heartbeat
 * timeout. Holding a wake lock while on air is what keeps a mobile show up.
 */
const release = vi.fn().mockResolvedValue(undefined);
// Capture the "release" listener so a test can fire it, the way a real browser
// does when the page is hidden — without that the hook still holds its sentinel
// and correctly declines to request a second one.
let releaseListener: (() => void) | null = null;
const request = vi.fn().mockImplementation(async () => ({
  release,
  addEventListener: (evt: string, cb: () => void) => { if (evt === "release") releaseListener = cb; },
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
});

describe("useWakeLock", () => {
  it("takes the lock while broadcasting", async () => {
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
  });

  it("does not take one when off air", () => {
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it("releases when the broadcast ends", async () => {
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    rerender({ on: false });
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });

  it("re-acquires when the tab becomes visible again", async () => {
    // The browser drops the lock whenever the page is hidden, so taking it
    // once at the start is not enough for a show that runs for an hour.
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // The browser drops the lock while hidden and tells us so.
    releaseListener?.();
    request.mockClear();

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });

  it("reports lack of support instead of throwing", () => {
    delete (navigator as any).wakeLock;
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current.supported).toBe(false);
  });
});
