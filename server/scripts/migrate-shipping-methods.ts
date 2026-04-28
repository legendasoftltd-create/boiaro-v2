import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
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
  name?: string;
  code?: string;
  area_type?: string;
  base_charge?: string;
  base_weight_kg?: string;
  extra_charge_per_kg?: string;
  delivery_time?: string;
  is_active?: string;
  sort_order?: string;
  provider_code?: string;
  created_at?: string;
}

function toBoolean(value?: string): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toFloat(value?: string, fallback = 0): number {
  const parsed = Number.parseFloat((value || "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableString(value?: string): string | null {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

async function migrateShippingMethods() {
  const csvPath = path.join(__dirname, "..", "data", "tables-data", "shipping_methods_rows.csv");
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
      const id = row.id?.trim();
      const name = row.name?.trim();
      if (!id || !name) {
        skipped++;
        continue;
      }

      const payload = {
        name,
        base_cost: toFloat(row.base_charge, 0),
        per_kg_cost: toFloat(row.extra_charge_per_kg, 0),
        delivery_days: toNullableString(row.delivery_time),
        zone: toNullableString(row.area_type),
        is_active: toBoolean(row.is_active),
        description: [toNullableString(row.code), toNullableString(row.provider_code)]
          .filter(Boolean)
          .join(" | ") || null,
      };

      const existing = await prisma.shippingMethod.findUnique({
        where: { id },
        select: { id: true },
      });

      if (existing) {
        await prisma.shippingMethod.update({
          where: { id },
          data: payload,
        });
        updated++;
      } else {
        await prisma.shippingMethod.create({
          data: {
            id,
            ...payload,
            created_at: row.created_at ? new Date(row.created_at) : undefined,
          },
        });
        inserted++;
      }
    } catch (error) {
      failed++;
      console.error(`Failed shipping method row (${row.id || "unknown"}):`, error);
    }
  }

  console.log(`Shipping methods inserted: ${inserted}`);
  console.log(`Shipping methods updated : ${updated}`);
  console.log(`Shipping methods skipped : ${skipped}`);
  console.log(`Shipping methods failed  : ${failed}`);
}

migrateShippingMethods()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
