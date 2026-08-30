import { describe, it, expect, vi } from "vitest";
import { normalizeErrorShape } from "./errorShape.js";

/**
 * Guards the fix for the two-shapes-of-error problem: ~200 handlers answered
 * with a bare { error: "<prose>" } while the rest used the unified envelope,
 * so a client could not tell a failure by shape and had to branch on prose.
 */
function run(statusCode: number, body: unknown) {
  const sent: unknown[] = [];
  const res: any = { statusCode, json: (b: unknown) => { sent.push(b); return res; } };
  normalizeErrorShape({} as any, res, () => {});
  res.json(body);
  return sent[0] as Record<string, unknown>;
}

describe("normalizeErrorShape", () => {
  it("leaves successful responses untouched", () => {
    const body = { balance: 10, transactions: [] };
    expect(run(200, body)).toBe(body);
  });

  it("adds success:false and message to a bare { error } body", () => {
    const out = run(400, { error: "Insufficient coins" });
    expect(out.success).toBe(false);
    expect(out.message).toBe("Insufficient coins");
    // The existing field keeps its existing meaning — clients reading .error
    // for display are not broken.
    expect(out.error).toBe("Insufficient coins");
  });

  it("preserves extra fields handlers attach", () => {
    const out = run(400, { error: "Insufficient coins", required: 100, balance: 10 });
    expect(out.required).toBe(100);
    expect(out.balance).toBe(10);
    expect(out.success).toBe(false);
  });

  it("leaves an already-unified envelope's message alone", () => {
    const out = run(409, { success: false, error: "DUPLICATE_VALUE", message: "A record with this code already exists" });
    expect(out.error).toBe("DUPLICATE_VALUE");
    expect(out.message).toBe("A record with this code already exists");
    expect(out.success).toBe(false);
  });

  it("falls back to a status-derived message when the body has neither", () => {
    const out = run(404, { detail: "nope" });
    expect(out.success).toBe(false);
    expect(out.message).toBe("Not found");
    expect(out.detail).toBe("nope");
  });

  it("uses `reason` as the message when that is all the handler sent", () => {
    const out = run(429, { reason: "Cooldown active", cooldown_seconds_left: 42 });
    expect(out.message).toBe("Cooldown active");
    expect(out.cooldown_seconds_left).toBe(42);
  });

  it("passes non-object error bodies straight through", () => {
    expect(run(500, null as any)).toBe(null);
  });
});
