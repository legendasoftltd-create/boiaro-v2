import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface CsvRow {
  _id?: string;
  name?: string;
  image?: string;
  is_active?: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: string;
  priority?: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  name_bn: string | null;
  name_en: string | null;
  slug: string | null;
  icon: string | null;
  priority: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

// Helper function to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Helper to detect if string is primarily English
function isEnglish(text: string): boolean {
  return /^[a-zA-Z\s]+$/.test(text);
}

async function migrateCategories() {
  const categories: CategoryRecord[] = [];
  let skippedCount = 0;
  let duplicateCount = 0;
  const ids = new Set<string>();

  const csvPath = path.join(__dirname, "..", "data", "categories.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`);
    console.log('Please place categories.csv in the "data" folder at project root');
    process.exit(1);
  }

  console.log(`Reading CSV from: ${csvPath}`);

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CsvRow) => {
        // Skip rows without name or with is_active = 0
        if (!row.name || !row.name.trim()) {
          skippedCount++;
          return;
        }

        if (row.is_active === "0") {
          skippedCount++;
          return;
        }

        const id = row._id?.trim();
        
        // Check for duplicate IDs
        if (id && ids.has(id)) {
          duplicateCount++;
          return;
        }
        
        if (id) {
          ids.add(id);
        }

        const name = row.name.trim();
        const name_bn = name; // CSV name is in Bengali
        const name_en = isEnglish(name) ? name : null;
        const slugBase = generateSlug(name);
        const slug = slugBase || `category-${id || crypto.randomUUID().slice(0, 8)}`;
        const icon = row.image && row.image !== "" ? `/uploads/${row.image}` : null;
        const priority = row.priority ? parseInt(row.priority, 10) : 0;
        const status = row.is_active === "1" ? "active" : "inactive";
        const created_at = row.createdAt ? new Date(row.createdAt) : new Date();
        const updated_at = row.updatedAt ? new Date(row.updatedAt) : created_at;

        categories.push({
          id: id || crypto.randomUUID(), // Use existing ID or generate new one
          name,
          name_bn,
          name_en,
          slug,
          icon,
          priority,
          status,
          created_at,
          updated_at,
        });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`\nCSV Analysis:`);
  console.log(`   Valid categories to migrate : ${categories.length}`);
  console.log(`   Skipped (no name/inactive)  : ${skippedCount}`);
  console.log(`   Duplicates skipped          : ${duplicateCount}`);

  if (categories.length === 0) {
    console.log("No categories to migrate. Exiting.");
    return;
  }

  // Sort by priority
  categories.sort((a, b) => a.priority - b.priority);

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: { name: string; error: string }[] = [];

  const batchSize = 50;
  for (let i = 0; i < categories.length; i += batchSize) {
    const batch = categories.slice(i, i + batchSize);

    for (const category of batch) {
      try {
        const existingByName = await prisma.category.findFirst({
          where: { name: category.name },
          select: { id: true },
        });
        const targetId = existingByName?.id ?? category.id;
        const alreadyExists = existingByName || (await prisma.category.findUnique({
          where: { id: targetId },
          select: { id: true },
        }));

        await prisma.category.upsert({
          where: { id: targetId },
          update: {
            name: category.name,
            name_bn: category.name_bn,
            name_en: category.name_en,
            slug: category.slug,
            icon: category.icon,
            priority: category.priority,
            status: category.status,
          },
          create: {
            id: targetId,
            name: category.name,
            name_bn: category.name_bn,
            name_en: category.name_en,
            slug: category.slug,
            icon: category.icon,
            priority: category.priority,
            status: category.status,
            created_at: category.created_at,
          },
        });
        if (alreadyExists) updated++;
        else inserted++;

        if ((inserted + updated) % 100 === 0) {
          console.log(`Processed ${inserted + updated} categories...`);
        }
      } catch (error: unknown) {
        errors++;
        const message = error instanceof Error ? error.message : String(error);
        errorDetails.push({ name: category.name, error: message });
        console.error(`Failed to process category "${category.name}":`, message);
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`MIGRATION SUMMARY`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Successfully inserted : ${inserted} categories`);
  console.log(`Successfully updated  : ${updated} categories`);
  console.log(`Failed                : ${errors} categories`);

  const shown = errorDetails.slice(0, 10);
  if (shown.length > 0) {
    console.log(
      `\n${errorDetails.length > 10 ? `First 10 of ${errorDetails.length} errors` : "Errors"}:`
    );
    shown.forEach(({ name, error }) => console.log(`   - ${name}: ${error}`));
  }

  // Print category priority order
  console.log(`\n${"=".repeat(50)}`);
  console.log(`CATEGORY PRIORITY ORDER`);
  console.log(`${"=".repeat(50)}`);
  categories.forEach((cat, idx) => {
    console.log(`${idx + 1}. ${cat.name} (Priority: ${cat.priority})`);
  });
}

// Run migration with cleanup
migrateCategories()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());