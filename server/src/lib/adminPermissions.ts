import { prisma } from "./prisma.js";

/**
 * Server-side enforcement for the admin module permission map.
 *
 * The permission map (admin_role_permissions / role_permissions) has existed
 * for a long time, but it was only ever read by the frontend to decide which
 * menu items to render. Every admin procedure enforced nothing beyond "does
 * this user hold the admin or moderator role", so a restricted admin who
 * bypassed the UI and called the tRPC endpoint directly had full access to
 * finance, users, roles and withdrawals. This module is the missing half.
 */

export const PERM_MODULES = [
  "books", "content", "users", "orders", "payments", "revenue", "reports",
  "support", "settings", "roles", "email", "notifications", "analytics",
  "cms", "subscriptions", "coupons", "shipping", "withdrawals",
] as const;

export type PermModule = (typeof PERM_MODULES)[number];

/**
 * Modules a moderator gets no access to under the unseeded fallback. Finance
 * and identity: money, people and the permissions themselves.
 */
export const MODERATOR_DENIED: readonly string[] = [
  "revenue", "withdrawals", "payments", "users", "roles", "settings",
];
export type PermAction = "view" | "create" | "edit" | "delete";

export interface AdminAccess {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  roleName: string | null;
  /** Set of "module:action" keys. Ignored when isSuperAdmin. */
  allowed: Set<string>;
}

/**
 * Resolves what an actor may do, using exactly the same precedence the
 * frontend-facing admin.myPermissions query uses:
 *   1. active custom admin role with explicit permission rows
 *   2. AppRole "admin"      → super admin, unrestricted
 *   3. AppRole "moderator"  → role_permissions table
 *   4. moderator fallback   → view everything, no deletes, no roles/settings writes
 */
export async function resolveAdminAccess(userId: string): Promise<AdminAccess> {
  const none: AdminAccess = { isAdmin: false, isSuperAdmin: false, roleName: null, allowed: new Set() };

  const [customAssignment, appRole] = await Promise.all([
    prisma.adminUserRole.findFirst({
      where: { user_id: userId, is_active: true },
      include: { admin_role: { include: { admin_permissions: true } } },
    }),
    prisma.userRole.findFirst({
      where: { user_id: userId, role: { in: ["admin", "moderator"] } },
      orderBy: { role: "asc" }, // "admin" sorts before "moderator"
    }),
  ]);

  // A custom admin role grants admin standing on its own, but only over the
  // modules it actually lists.
  if (customAssignment && customAssignment.admin_role.admin_permissions.length > 0) {
    const allowed = new Set(
      customAssignment.admin_role.admin_permissions
        .filter((p) => p.is_allowed)
        .map((p) => p.permission_key)
    );
    return {
      isAdmin: true,
      isSuperAdmin: false,
      roleName: customAssignment.admin_role.name ?? "custom",
      allowed,
    };
  }

  if (!appRole) return none;

  if (appRole.role === "admin") {
    return { isAdmin: true, isSuperAdmin: true, roleName: "super_admin", allowed: new Set() };
  }

  const dbPerms = await prisma.rolePermission.findMany({ where: { role: "moderator" } });
  if (dbPerms.length > 0) {
    return {
      isAdmin: true,
      isSuperAdmin: false,
      roleName: "moderator",
      allowed: new Set(dbPerms.filter((p) => p.is_allowed).map((p) => p.permission_key)),
    };
  }

  // Fallback defaults, used until role_permissions is seeded. Mirrors
  // admin.myPermissions case 4 — change both together or the menu and the API
  // disagree.
  //
  // A moderator exists for chat/request/report moderation, so the finance and
  // identity modules are withheld entirely rather than granted read access.
  // The previous default gave every module :view, which meant an unseeded
  // deployment handed moderators the withdrawals, earnings, payments and user
  // lists — the exact exposure the permission map exists to prevent.
  const allowed = new Set<string>();
  for (const m of PERM_MODULES) {
    if (MODERATOR_DENIED.includes(m)) continue;
    allowed.add(`${m}:view`);
    allowed.add(`${m}:create`);
    allowed.add(`${m}:edit`);
  }
  return { isAdmin: true, isSuperAdmin: false, roleName: "moderator", allowed };
}

/**
 * `books` and `content` are adjacent catalogue-editing permissions and the
 * admin UI's own MODULE_MAP splits them inconsistently — /admin/books is
 * "books" while /admin/submissions (where books are approved) is "content".
 * Rather than have a role hold one and hit a 403 on a screen the menu offered,
 * either satisfies a requirement for the other.
 *
 * This is a deliberate, narrow widening. It applies only to this pair; the
 * modules that actually matter — revenue, withdrawals, payments, users, roles,
 * settings — are strictly separated and share nothing.
 */
const MODULE_ALIASES: Partial<Record<PermModule, PermModule[]>> = {
  books: ["content"],
  content: ["books"],
};

export function can(access: AdminAccess, module: PermModule, action: PermAction): boolean {
  if (access.isSuperAdmin) return true;
  if (access.allowed.has(`${module}:${action}`)) return true;
  for (const alias of MODULE_ALIASES[module] ?? []) {
    if (access.allowed.has(`${alias}:${action}`)) return true;
  }
  return false;
}

// ── Procedure → (module, action) classification ──────────────────────────────
//
// Derived from the procedure name so the ~300 existing admin procedures are all
// covered without hand-annotating each one. Order matters: the first matching
// pattern wins, so the narrow finance/permission terms are listed before the
// broad content ones.

// Order matters: the first matching pattern wins, so the narrow terms come
// before the broad ones.
//
// These are kept deliberately aligned with MODULE_MAP in
// src/hooks/useAdminPermissions.ts, which is what decides whether the admin UI
// shows a screen. If the two disagree, a role sees a menu item and then gets a
// 403 from the API behind it (or worse, the reverse) — so any change here needs
// the same change there. adminPermissions.test.ts pins the pairs that matter.
// Order matters: the first matching pattern wins, so the narrow terms come
// before the broad ones.
//
// These are kept deliberately aligned with MODULE_MAP in
// src/hooks/useAdminPermissions.ts, which is what decides whether the admin UI
// shows a screen. If the two disagree, a role sees a menu item and then gets a
// 403 from the API behind it (or worse, the reverse) — so any change here needs
// the same change there. adminPermissions.test.ts pins the pairs that matter.
const MODULE_RULES: [RegExp, PermModule][] = [
  [/withdraw/i,                                        "withdrawals"],
  [/coupon/i,                                          "coupons"],
  [/subscription|subscriber|plan/i,                    "subscriptions"],
  [/shipping|shipment|courier|redx|parcel|delivery/i,  "shipping"],
  [/smtp|email|mailer/i,                               "email"],
  [/notification|push|fcm|firebase|sms|announce/i,     "notifications"],
  [/support|ticket/i,                                  "support"],

  // Activity/audit logs live on the Roles screen, not with the system logs.
  [/activitylog|auditlog|logaction/i,                  "roles"],
  [/adminrole|rolepermission|permission|role|team/i,   "roles"],

  // Ad *reports* are analytics; everything else ad-related is a setting.
  [/adreport/i,                                        "analytics"],
  [/adcampaign|adplacement|adbanner|adslide|adconfig|adsetting|\bads?\b/i, "settings"],
  [/gamification|badge|quiz|competition|leaderboard|streak|referral|drm/i,   "settings"],
  [/coinpackage|coinsetting|paymentgateway|gateway|analyticssetting/i,       "settings"],

  [/earning|revenue|payout|ledger|accounting|finance|prize|investor/i, "revenue"],

  // Radio / On Air is managed from the CMS screens — including its abuse
  // reports, which are moderation, not reporting.
  [/radioreport|rj|onair|schedule|radio|station|callin|catchup|broadcast|livesession/i, "cms"],
  [/cms|blog|banner|homepage|footer|menu|page/i,       "cms"],

  // Taxonomy, reviews and submissions are the "content" module in the UI.
  // Checked before the catalogue rule because several of them (book approval,
  // book submissions) mention "book" while belonging to a content screen.
  [/author|narrator|publisher|translator|categor|review|submission|\btts|editrequest/i, "content"],

  // Catalogue objects, before `order` — otherwise reorderAudiobookTracks is
  // read as an orders action because it contains the substring "order".
  [/book|audiobook|ebook|track|chapter|format|series|contributor/i, "books"],

  [/wallet|coin|payment|transaction|refund|cod/i,      "payments"],
  [/order/i,                                           "orders"],

  // The dashboard and the operational monitoring screens sit under Reports.
  [/dashboard|weeklyreport|performance|livemonitoring|systemalert|systemlog|servermetric|sessionshealth/i, "reports"],
  [/analytic|garealtime|\bstats?\b|insight|recommendation/i, "analytics"],
  [/report/i,                                          "reports"],

  [/setting|config|platform|backup|dbhealth|storage|migration|rollout|cleanup|alert/i, "settings"],
  [/user|creator|applicant|application/i,              "users"],

];

const DELETE_VERBS = /^(delete|remove|purge|destroy|clear|cleanup|revoke|unassign)/i;
const CREATE_VERBS = /^(create|add|new|generate|import|assign|upload|issue|seed|duplicate|clone)/i;
const EDIT_VERBS   = /^(update|edit|set|save|approve|reject|toggle|process|confirm|cancel|adjust|bulk|sync|reorder|move|resend|send|mark|publish|unpublish|suspend|deactivate|reactivate|regenerate|recalculate|recompute|apply|link|unlink|restore|merge|reset|retry|start|stop|end|close|open|lock|unlock|enable|disable|test|run|trigger|attach|detach|award|grant|pay|settle|refund|replace)/i;

/**
 * Procedures the admin panel needs before it can render anything — blocking
 * these would lock a restricted admin out of the panel entirely rather than
 * just out of the modules they lack.
 */
const ALWAYS_ALLOWED = new Set([
  "myPermissions",
  "myAdminRole",
  "permissionOverrides",
]);

export function classifyProcedure(name: string): { module: PermModule; action: PermAction } | null {
  if (ALWAYS_ALLOWED.has(name)) return null;

  let module: PermModule = "content";
  for (const [pattern, mod] of MODULE_RULES) {
    if (pattern.test(name)) { module = mod; break; }
  }

  let action: PermAction = "view";
  if (DELETE_VERBS.test(name)) action = "delete";
  else if (CREATE_VERBS.test(name)) action = "create";
  else if (EDIT_VERBS.test(name)) action = "edit";

  return { module, action };
}
