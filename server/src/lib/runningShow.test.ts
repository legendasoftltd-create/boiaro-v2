import { describe, it, expect } from "vitest";
import { runningShowMessage } from "./runningShow.js";

/**
 * Guards the message an RJ gets when a second broadcast is refused.
 *
 * The times shown must be Dhaka, not the server's zone — production runs on
 * Europe/Berlin, and a mismatched clock has already caused one misdiagnosis
 * on this project. An RJ told their show started at "07:33" when their phone
 * says 11:33 will not believe the message names their show.
 */
describe("runningShowMessage", () => {
  const at = new Date("2026-08-31T05:33:59Z"); // 11:33 in Dhaka (UTC+6)

  it("renders the start time in Dhaka time, not the server's zone", () => {
    expect(runningShowMessage({ show_title: "সকালের আড্ডা", started_at: at })).toContain("11:33");
  });

  it("names the show so the RJ knows which one to end", () => {
    const msg = runningShowMessage({ show_title: "সকালের আড্ডা", started_at: at });
    expect(msg).toContain("সকালের আড্ডা");
    expect(msg).toContain("শেষ করুন");
  });

  it("falls back to the start time when the show is untitled", () => {
    const msg = runningShowMessage({ show_title: null, started_at: at });
    expect(msg).toContain("11:33");
    expect(msg).not.toContain('""');
  });

  it("treats a blank title as untitled rather than printing empty quotes", () => {
    expect(runningShowMessage({ show_title: "   ", started_at: at })).not.toContain('""');
  });
});
