import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/index.js";
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
  gateway_key?: string;
  label?: string;
  is_enabled?: string;
  mode?: string;
  sort_priority?: string;
  config?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

function toBoolean(value?: string): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toNullableString(value?: string): string | null {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseJsonConfig(value?: string): Prisma.InputJsonValue {
  const raw = (value || "").trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Prisma.InputJsonValue;
  } catch {
    return {};
  }
}

async function migratePaymentGateways() {
  const csvPath = path.join(__dirname, "..", "data", "tables-data", "payment_gateways_rows.csv");
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

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const gatewayKey = row.gateway_key?.trim();
      if (!gatewayKey) {
        skipped++;
        continue;
      }

      const payload = {
        label: row.label?.trim() || gatewayKey,
        is_enabled: toBoolean(row.is_enabled),
        mode: toNullableString(row.mode),
        sort_priority: row.sort_priority ? parseInt(row.sort_priority, 10) || 0 : 0,
        config: parseJsonConfig(row.config),
        notes: toNullableString(row.notes),
      };

      const existing = await prisma.paymentGateway.findUnique({
        where: { gateway_key: gatewayKey },
        select: { id: true },
      });

      if (existing) {
        await prisma.paymentGateway.update({
          where: { gateway_key: gatewayKey },
          data: payload,
        });
        updated++;
      } else {
        await prisma.paymentGateway.create({
          data: {
            id: row.id?.trim() || undefined,
            gateway_key: gatewayKey,
            ...payload,
            created_at: row.created_at ? new Date(row.created_at) : undefined,
          },
        });
        inserted++;
      }
    } catch (error) {
      failed++;
      console.error(`Failed payment gateway row (${row.gateway_key || "missing_key"}):`, error);
    }
  }

  console.log(`Payment gateways inserted: ${inserted}`);
  console.log(`Payment gateways updated : ${updated}`);
  console.log(`Payment gateways skipped : ${skipped}`);
  console.log(`Payment gateways failed  : ${failed}`);
}

migratePaymentGateways()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
