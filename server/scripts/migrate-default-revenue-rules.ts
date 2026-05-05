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
  format?: string;
  writer_percentage?: string;
  publisher_percentage?: string;
  narrator_percentage?: string;
  platform_percentage?: string;
  fulfillment_cost_percentage?: string;
  created_at?: string;
  updated_at?: string;
}

function toFloat(value?: string): number {
  const parsed = parseFloat((value || "").trim());
  return isNaN(parsed) ? 0 : parsed;
}

async function migrateDefaultRevenueRules() {
  const csvPath = path.join(__dirname, "..", "data", "tables-data", "default_revenue_rules_rows.csv");
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
      const format = row.format?.trim();
      if (!format) {
        skipped++;
        continue;
      }

      const payload = {
        writer_percentage: toFloat(row.writer_percentage),
        publisher_percentage: toFloat(row.publisher_percentage),
        narrator_percentage: toFloat(row.narrator_percentage),
        platform_percentage: toFloat(row.platform_percentage),
        fulfillment_cost_percentage: toFloat(row.fulfillment_cost_percentage),
        updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
      };

      const existing = await prisma.defaultRevenueRule.findFirst({
        where: { format },
        select: { id: true },
      });

      if (existing) {
        await prisma.defaultRevenueRule.update({
          where: { id: existing.id },
          data: payload,
        });
        updated++;
      } else {
        await prisma.defaultRevenueRule.create({
          data: {
            id: row.id?.trim() || undefined,
            format,
            ...payload,
            created_at: row.created_at ? new Date(row.created_at) : undefined,
          },
        });
        inserted++;
      }
    } catch (error) {
      failed++;
      console.error(`Failed default revenue rule row (${row.format || "missing_format"}):`, error);
    }
  }

  console.log(`Default revenue rules inserted: ${inserted}`);
  console.log(`Default revenue rules updated : ${updated}`);
  console.log(`Default revenue rules skipped : ${skipped}`);
  console.log(`Default revenue rules failed  : ${failed}`);
}

migrateDefaultRevenueRules()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
