import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppRole, PrismaClient } from "../src/generated/prisma/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface CsvRow {
  id?: string;
  role_id?: string;
  module?: string;
  can_view?: string;
  can_create?: string;
  can_edit?: string;
  can_delete?: string;
}

const APP_ROLE_VALUES = new Set<string>(Object.values(AppRole));
const ACTIONS = ["view", "create", "edit", "delete"] as const;

function toBoolean(value?: string): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function migrateRolePermissions() {
  const csvPath = path.join(__dirname, "..", "data", "tables-data", "role_permissions_rows.csv");
  const rows: CsvRow[] = [];

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading CSV from: ${csvPath}`);

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CsvRow) => rows.push(row))
      .on("end", resolve)
      .on("error", reject);
  });

  const adminRoles = await prisma.adminRole.findMany({
    select: { id: true, name: true },
  });
  const appRoleByAdminRoleId = new Map<string, AppRole>();
  for (const role of adminRoles) {
    const roleName = (role.name || "").trim();
    if (APP_ROLE_VALUES.has(roleName)) {
      appRoleByAdminRoleId.set(role.id, roleName as AppRole);
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const roleId = row.role_id?.trim();
      const moduleName = row.module?.trim();
      if (!roleId || !moduleName) {
        skipped++;
        continue;
      }

      const appRole = appRoleByAdminRoleId.get(roleId);
      if (!appRole) {
        skipped++;
        continue;
      }

      const actionFlags = {
        view: toBoolean(row.can_view),
        create: toBoolean(row.can_create),
        edit: toBoolean(row.can_edit),
        delete: toBoolean(row.can_delete),
      };

      for (const action of ACTIONS) {
        const permissionKey = `${moduleName}:${action}`;
        const isAllowed = actionFlags[action];

        const existing = await prisma.rolePermission.findUnique({
          where: {
            role_permission_key: {
              role: appRole,
              permission_key: permissionKey,
            },
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.rolePermission.update({
            where: { id: existing.id },
            data: { is_allowed: isAllowed },
          });
          updated++;
        } else {
          await prisma.rolePermission.create({
            data: {
              role: appRole,
              permission_key: permissionKey,
              is_allowed: isAllowed,
            },
          });
          inserted++;
        }
      }
    } catch (error) {
      failed++;
      console.error(`Failed role permission row (${row.id || "unknown"}):`, error);
    }
  }

  console.log(`Role permissions inserted: ${inserted}`);
  console.log(`Role permissions updated : ${updated}`);
  console.log(`Role permissions skipped : ${skipped}`);
  console.log(`Role permissions failed  : ${failed}`);
}

migrateRolePermissions()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
