import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppRole, PrismaClient } from "../src/generated/prisma/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface CsvRow {
  email?: string;
  firstname?: string;
  lastname?: string;
  username?: string;
  password?: string;
  country_code?: string;
  provider?: string;
  providerId?: string;
  phone?: string;
  image?: string;
  active?: string;
  is_verified?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface UserRecord {
  user: {
    email: string;
    password_hash: string;
    email_verified: boolean;
    created_at: Date;
    updated_at: Date;
  };
  profile: {
    full_name: string | null;
    display_name: string | null;
    phone: string | null;
    avatar_url: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  };
}

// Unusable placeholder hash for social-login users — they must reset password to set one
const SOCIAL_PASSWORD_HASH = await bcrypt.hash(
  `SOCIAL_NO_PASSWORD_${Date.now()}`,
  12
);

function toBoolean(value?: string): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizePhone(countryCode?: string, phone?: string): string | null {
  const cc = (countryCode || "").trim();
  const p = (phone || "").trim();
  if (!cc && !p) return null;
  return `${cc}${p}`.replace(/\s+/g, "");
}

async function migrateUsers() {
  const users: UserRecord[] = [];
  const emails = new Set<string>();
  let duplicateCount = 0;
  let skippedCount = 0;

  const csvPath = path.join(__dirname, "..", "data", "users.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`);
    console.log('Please place users.csv in the "data" folder at project root');
    process.exit(1);
  }

  console.log(`Reading CSV from: ${csvPath}`);

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CsvRow) => {
        if (!row.email || !row.email.includes("@")) {
          skippedCount++;
          return;
        }

        const email = row.email.trim().toLowerCase();

        if (emails.has(email)) {
          duplicateCount++;
          return;
        }
        emails.add(email);

        const firstName = (row.firstname || "").trim();
        const lastName = (row.lastname || "").trim();
        let fullName = "";
        if (firstName && lastName) fullName = `${firstName} ${lastName}`;
        else if (firstName) fullName = firstName;
        else if (lastName) fullName = lastName;

        const passwordHash =
          row.password && row.password.trim() !== ""
            ? row.password.trim()
            : SOCIAL_PASSWORD_HASH;

        users.push({
          user: {
            email,
            password_hash: passwordHash,
            email_verified: toBoolean(row.is_verified),
            created_at: row.createdAt ? new Date(row.createdAt) : new Date(),
            updated_at: row.updatedAt ? new Date(row.updatedAt) : new Date(),
          },
          profile: {
            full_name: fullName || null,
            display_name:
              row.username && row.username.trim() !== ""
                ? row.username.trim()
                : null,
            phone: normalizePhone(row.country_code, row.phone),
            avatar_url: row.image && row.image !== "" ? row.image : null,
            is_active: toBoolean(row.active),
            created_at: row.createdAt ? new Date(row.createdAt) : new Date(),
            updated_at: row.updatedAt ? new Date(row.updatedAt) : new Date(),
          },
        });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  const socialCount = users.filter(
    (u) => u.user.password_hash === SOCIAL_PASSWORD_HASH
  ).length;

  console.log(`\nCSV Analysis:`);
  console.log(`   Valid users to migrate : ${users.length}`);
  console.log(`   With password          : ${users.length - socialCount}`);
  console.log(`   Without password       : ${socialCount}`);
  console.log(`   Duplicates skipped     : ${duplicateCount}`);
  console.log(`   Invalid rows skipped   : ${skippedCount}`);

  if (users.length === 0) {
    console.log("No users to migrate. Exiting.");
    return;
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: { email: string; error: string }[] = [];

  const batchSize = 50;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    for (const { user, profile } of batch) {
      try {
        await prisma.$transaction(async (tx) => {
          const existing = await tx.user.findUnique({
            where: { email: user.email },
          });
          if (existing) {
            await tx.user.update({
              where: { id: existing.id },
              data: {
                password_hash: user.password_hash,
                email_verified: user.email_verified,
              },
            });

            await tx.profile.upsert({
              where: { user_id: existing.id },
              update: {
                full_name: profile.full_name,
                display_name: profile.display_name,
                phone: profile.phone,
                avatar_url: profile.avatar_url,
                is_active: profile.is_active,
              },
              create: { user_id: existing.id, ...profile },
            });

            await tx.userRole.upsert({
              where: {
                user_id_role: {
                  user_id: existing.id,
                  role: AppRole.user,
                },
              },
              update: {},
              create: { user_id: existing.id, role: AppRole.user },
            });
            updated++;
            return;
          }

          const newUser = await tx.user.create({ data: user });

          await tx.profile.create({
            data: { ...profile, user_id: newUser.id },
          });

          await tx.userRole.create({
            data: { user_id: newUser.id, role: AppRole.user },
          });
        });

        inserted++;
        if ((inserted + updated) % 100 === 0) {
          console.log(`Migrated ${inserted + updated} users...`);
        }
      } catch (error: unknown) {
        errors++;
        const message =
          error instanceof Error ? error.message : String(error);
        errorDetails.push({ email: user.email, error: message });
        console.error(`Failed to migrate ${user.email}:`, message);
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`MIGRATION SUMMARY`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Inserted             : ${inserted} users`);
  console.log(`Updated              : ${updated} users`);
  console.log(`Failed               : ${errors} users`);

  const shown = errorDetails.slice(0, 10);
  if (shown.length > 0) {
    console.log(
      `\n${errorDetails.length > 10 ? `First 10 of ${errorDetails.length} errors` : "Errors"}:`
    );
    shown.forEach(({ email, error }) => console.log(`   - ${email}: ${error}`));
  }
}

migrateUsers()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
