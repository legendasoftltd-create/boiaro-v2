import { describe, it, expect } from "vitest";
import { classifyProcedure, can, PERM_MODULES, type AdminAccess } from "./adminPermissions.js";

/**
 * These guard the fix for the permission bypass: admin module permissions used
 * to be frontend-only, so a restricted admin who called the tRPC endpoint
 * directly reached finance, users, roles and withdrawals regardless of their
 * role. Enforcement is now derived from the procedure name, which means the
 * classification itself has to be correct — hence these tests.
 */

function access(partial: Partial<AdminAccess>): AdminAccess {
  return { isAdmin: true, isSuperAdmin: false, roleName: "test", allowed: new Set(), ...partial };
}

describe("classifyProcedure", () => {
  it("routes finance-sensitive procedures to their own modules", () => {
    expect(classifyProcedure("listWithdrawals")).toEqual({ module: "withdrawals", action: "view" });
    expect(classifyProcedure("processWithdrawal")).toEqual({ module: "withdrawals", action: "edit" });
    expect(classifyProcedure("confirmEarnings")).toEqual({ module: "revenue", action: "edit" });
    expect(classifyProcedure("createAccountingLedgerEntry")).toEqual({ module: "revenue", action: "create" });
  });

  it("agrees with the admin UI's MODULE_MAP on the screens that matter", () => {
    // Each pair below is (procedure, module the UI uses for its screen — see
    // MODULE_MAP in src/hooks/useAdminPermissions.ts). A disagreement means a
    // role sees a menu item and then gets a 403 from the API behind it.
    const pairs: [string, string][] = [
      ["dashboard", "reports"],            // /admin              -> reports
      ["serverMetrics", "reports"],        // /admin/performance  -> reports
      ["listSystemAlerts", "reports"],     // /admin/alerts       -> reports
      ["analyticsReportData", "analytics"],// /admin/analytics    -> analytics
      ["adReportSummary", "analytics"],    // /admin/ad-reports   -> analytics
      ["listPaymentGateways", "settings"], // /admin/payment-gateways -> settings
      ["listAdCampaigns", "settings"],     // /admin/ad-campaigns -> settings
      ["listCoinPackages", "settings"],    // /admin/coin-packages-> settings
      ["activityLogs", "roles"],           // /admin/activity-logs-> roles
      ["listAuthors", "content"],          // /admin/authors      -> content
      ["listCategories", "content"],       // /admin/categories   -> content
      ["listSubmissions", "content"],      // /admin/submissions  -> content
      ["listRjProfiles", "cms"],           // /admin/rj-management-> cms
      ["upsertRadioStation", "cms"],       // /admin/radio        -> cms
      ["listWallets", "payments"],         // /admin/wallets      -> payments
      ["listEarnings", "revenue"],         // /admin/earnings     -> revenue
      ["listWithdrawals", "withdrawals"],  // /admin/withdrawals  -> withdrawals
      ["listSupportTickets", "support"],   // /admin/tickets      -> support
    ];
    for (const [proc, expected] of pairs) {
      expect(classifyProcedure(proc)?.module, proc).toBe(expected);
    }
  });

  it("does not read a catalogue action as an order action", () => {
    // "reorderAudiobookTracks" contains the substring "order".
    expect(classifyProcedure("reorderAudiobookTracks")?.module).toBe("books");
    expect(classifyProcedure("listOrders")?.module).toBe("orders");
  });

  it("treats radio abuse reports as moderation, not reporting", () => {
    expect(classifyProcedure("radioReports")?.module).toBe("cms");
    expect(classifyProcedure("reviewRadioReport")?.module).toBe("cms");
  });

  it("routes role and permission procedures to the roles module", () => {
    expect(classifyProcedure("listRoles")?.module).toBe("roles");
    expect(classifyProcedure("setRolePermissions")).toEqual({ module: "roles", action: "edit" });
    expect(classifyProcedure("assignAdminRoleToUser")).toEqual({ module: "roles", action: "create" });
    expect(classifyProcedure("deleteAdminRole")).toEqual({ module: "roles", action: "delete" });
  });

  it("derives the action from the verb", () => {
    expect(classifyProcedure("createCoupon")?.action).toBe("create");
    expect(classifyProcedure("updateCoupon")?.action).toBe("edit");
    expect(classifyProcedure("deleteCoupon")?.action).toBe("delete");
    expect(classifyProcedure("listCoupons")?.action).toBe("view");
  });

  it("treats approve/reject/toggle/adjust as edits, not reads", () => {
    for (const name of ["approveBook", "rejectReview", "toggleUserActive", "adjustUserCoins", "markCodPaid"]) {
      expect(classifyProcedure(name)?.action).toBe("edit");
    }
  });

  it("never leaves a procedure unclassified except the bootstrap allow-list", () => {
    expect(classifyProcedure("myPermissions")).toBeNull();
    const result = classifyProcedure("someBrandNewProcedure");
    expect(result).not.toBeNull();
    expect(PERM_MODULES).toContain(result!.module);
  });

  it("defaults an unknown noun to a real module rather than to no check", () => {
    // The failure mode to avoid is a new procedure silently escaping enforcement.
    const result = classifyProcedure("zzzUnknownThing");
    expect(result?.module).toBe("content");
    expect(result?.action).toBe("view");
  });
});

describe("can", () => {
  it("grants everything to a super admin", () => {
    const su = access({ isSuperAdmin: true });
    expect(can(su, "withdrawals", "delete")).toBe(true);
    expect(can(su, "roles", "edit")).toBe(true);
  });

  it("grants only what the role's permission keys list", () => {
    const restricted = access({ allowed: new Set(["books:view", "books:edit"]) });
    expect(can(restricted, "books", "view")).toBe(true);
    expect(can(restricted, "books", "edit")).toBe(true);
    expect(can(restricted, "books", "delete")).toBe(false);
    expect(can(restricted, "withdrawals", "view")).toBe(false);
  });

  it("accepts books and content interchangeably, but nothing else", () => {
    const booksOnly = access({ allowed: new Set(["books:view", "books:edit"]) });
    // The UI splits these two inconsistently, so either satisfies the other.
    expect(can(booksOnly, "content", "view")).toBe(true);
    expect(can(booksOnly, "content", "edit")).toBe(true);
    // The alias must not leak into anything else, and must not widen the action.
    expect(can(booksOnly, "content", "delete")).toBe(false);
    expect(can(booksOnly, "revenue", "view")).toBe(false);
    expect(can(booksOnly, "users", "view")).toBe(false);
    expect(can(booksOnly, "settings", "view")).toBe(false);
  });

  it("denies a module the role has no keys for at all", () => {
    const noFinance = access({ allowed: new Set(["content:view"]) });
    for (const action of ["view", "create", "edit", "delete"] as const) {
      expect(can(noFinance, "revenue", action)).toBe(false);
      expect(can(noFinance, "withdrawals", action)).toBe(false);
    }
  });
});
