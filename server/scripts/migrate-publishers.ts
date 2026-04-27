import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppRole, PrismaClient } from "../src/generated/prisma/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface CsvRow {
  _id?: string;
  name?: string;
  description?: string;
  image?: string;
  is_active?: string;
  createdAt?: string;
  updatedAt?: string;
  email?: string;
  password?: string;
  phone?: string;
  username?: string;
  priority?: string;
}

const SOCIAL_PASSWORD_HASH = await bcrypt.hash(`SOCIAL_NO_PASSWORD_${Date.now()}`, 12);

function normalizeText(value?: string): string | null {
  const v = (value || "").trim();
  return v.length ? v : null;
}

function isEnglish(text: string): boolean {
  return /^[a-zA-Z\s]+$/.test(text);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateRandomMigratedEmail(seed: string): string {
  const base = slugify(seed) || "publisher";
  return `${base}+${crypto.randomUUID().slice(0, 12)}@migrated.local`;
}

async function migratePublishers() {
  const rows: CsvRow[] = [];
  const csvPath = path.join(__dirname, "..", "data", "publishers.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`publishers.csv not found at ${csvPath}`);
  }

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CsvRow) => rows.push(row))
      .on("end", resolve)
      .on("error", reject);
  });

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const name = normalizeText(row.name);
      if (!name || row.is_active === "0") continue;

      const id = normalizeText(row._id) || crypto.randomUUID();
      const email = normalizeText(row.email)?.toLowerCase() || null;
      const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
      const updatedAt = row.updatedAt ? new Date(row.updatedAt) : new Date();
      const logo = normalizeText(row.image);
      const logo_url = logo ? (logo.startsWith("http") ? logo : `/uploads/${logo}`) : null;

      const existingByName = await prisma.publisher.findFirst({
        where: { OR: [{ id }, { name }, ...(email ? [{ email }] : [])] },
        select: { id: true },
      });
      const targetId = existingByName?.id ?? id;
      const existed = Boolean(existingByName);

      const fallbackEmail = generateRandomMigratedEmail(normalizeText(row.username) || name);
      const userEmail = (email || fallbackEmail).toLowerCase();
      const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: {
          password_hash: normalizeText(row.password) || SOCIAL_PASSWORD_HASH,
          email_verified: Boolean(email),
        },
        create: {
          email: userEmail,
          password_hash: normalizeText(row.password) || SOCIAL_PASSWORD_HASH,
          email_verified: Boolean(email),
          created_at: createdAt,
          updated_at: updatedAt,
        },
        select: { id: true },
      });
      const userId: string | null = user.id;

      await prisma.profile.upsert({
        where: { user_id: user.id },
        update: {
          full_name: name,
          display_name: normalizeText(row.username) || name,
          phone: normalizeText(row.phone),
          avatar_url: logo_url,
          bio: normalizeText(row.description),
          is_active: true,
        },
        create: {
          user_id: user.id,
          full_name: name,
          display_name: normalizeText(row.username) || name,
          phone: normalizeText(row.phone),
          avatar_url: logo_url,
          bio: normalizeText(row.description),
          is_active: true,
          created_at: createdAt,
          updated_at: updatedAt,
        },
      });

      await prisma.userRole.upsert({
        where: { user_id_role: { user_id: user.id, role: AppRole.publisher } },
        update: {},
        create: { user_id: user.id, role: AppRole.publisher },
      });

      await prisma.publisher.upsert({
        where: { id: targetId },
        update: {
          name,
          name_en: isEnglish(name) ? name : null,
          description: normalizeText(row.description),
          logo_url,
          email: userEmail,
          phone: normalizeText(row.phone),
          priority: row.priority ? parseInt(row.priority, 10) : 0,
          status: "active",
          user_id: userId,
        },
        create: {
          id: targetId,
          name,
          name_en: isEnglish(name) ? name : null,
          description: normalizeText(row.description),
          logo_url,
          email: userEmail,
          phone: normalizeText(row.phone),
          priority: row.priority ? parseInt(row.priority, 10) : 0,
          status: "active",
          user_id: userId,
          created_at: createdAt,
          updated_at: updatedAt,
        },
      });

      if (existed) updated++;
      else inserted++;
    } catch (error) {
      failed++;
      console.error("Failed publisher row:", error);
    }
  }

  // Final hard guarantee: no publisher should remain without user_id
  let backfilledUserLinks = 0;
  const orphanPublishers = await prisma.publisher.findMany({
    where: { user_id: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      description: true,
      logo_url: true,
      created_at: true,
      updated_at: true,
    },
  });

  for (const orphan of orphanPublishers) {
    try {
      const userEmail = (normalizeText(orphan.email) || generateRandomMigratedEmail(orphan.name)).toLowerCase();
      const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: {},
        create: {
          email: userEmail,
          password_hash: SOCIAL_PASSWORD_HASH,
          email_verified: Boolean(normalizeText(orphan.email)),
          created_at: orphan.created_at,
          updated_at: orphan.updated_at,
        },
        select: { id: true },
      });

      await prisma.profile.upsert({
        where: { user_id: user.id },
        update: {
          full_name: orphan.name,
          display_name: orphan.name,
          phone: orphan.phone,
          avatar_url: orphan.logo_url,
          bio: orphan.description,
          is_active: true,
        },
        create: {
          user_id: user.id,
          full_name: orphan.name,
          display_name: orphan.name,
          phone: orphan.phone,
          avatar_url: orphan.logo_url,
          bio: orphan.description,
          is_active: true,
          created_at: orphan.created_at,
          updated_at: orphan.updated_at,
        },
      });

      await prisma.userRole.upsert({
        where: {
          user_id_role: {
            user_id: user.id,
            role: AppRole.publisher,
          },
        },
        update: {},
        create: {
          user_id: user.id,
          role: AppRole.publisher,
        },
      });

      await prisma.publisher.update({
        where: { id: orphan.id },
        data: {
          user_id: user.id,
          email: userEmail,
        },
      });

      backfilledUserLinks++;
    } catch (error) {
      failed++;
      console.error(`Failed to backfill user for publisher "${orphan.name}":`, error);
    }
  }

  console.log(`Publishers inserted: ${inserted}`);
  console.log(`Publishers updated : ${updated}`);
  console.log(`Backfilled links   : ${backfilledUserLinks}`);
  console.log(`Publishers failed  : ${failed}`);
}

migratePublishers()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
