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
  facebook_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  website_url?: string;
  is_active?: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: string;
  since_year?: string;
  email?: string;
  password?: string;
  phone?: string;
  username?: string;
  priority?: string;
}

// Unusable placeholder hash for social-login users
const SOCIAL_PASSWORD_HASH = await bcrypt.hash(
  `SOCIAL_NO_PASSWORD_${Date.now()}`,
  12
);

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
  const base = slugify(seed) || "author";
  return `${base}+${crypto.randomUUID().slice(0, 12)}@migrated.local`;
}

async function migrateAuthors() {
  const authorsToProcess: any[] = [];
  let skippedCount = 0;
  let duplicateCount = 0;
  let duplicateEmailCount = 0;
  const ids = new Set<string>();

  const csvPath = path.join(__dirname, "..", "data", "authors.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`);
    console.log('Please place authors.csv in the "data" folder at project root');
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

        const email = normalizeText(row.email)?.toLowerCase() || null;

        const name = row.name.trim();
        const name_en = isEnglish(name) ? name : null;
        
        const bio = normalizeText(row.description);
        let avatar_url = null;
        if (row.image && row.image !== "") {
          if (!row.image.startsWith("http") && !row.image.startsWith("/uploads")) {
            avatar_url = `/uploads/${row.image}`;
          } else {
            avatar_url = row.image;
          }
        }
        
        const priority = row.priority ? parseInt(row.priority, 10) : 0;
        const status = row.is_active === "1" ? "active" : "inactive";
        const created_at = row.createdAt ? new Date(row.createdAt) : new Date();
        const updated_at = row.updatedAt ? new Date(row.updatedAt) : new Date();

        authorsToProcess.push({
          authorId: id || crypto.randomUUID(),
          name,
          name_en,
          bio,
          avatar_url,
          email,
          phone: normalizeText(row.phone),
          priority,
          status,
          created_at,
          updated_at,
          facebook_url: normalizeText(row.facebook_url),
          instagram_url: normalizeText(row.instagram_url),
          youtube_url: normalizeText(row.youtube_url),
          website_url: normalizeText(row.website_url),
          username: normalizeText(row.username),
          password: normalizeText(row.password),
        });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`\nCSV Analysis:`);
  console.log(`   Valid authors to migrate    : ${authorsToProcess.length}`);
  console.log(`   Skipped (no name/inactive)  : ${skippedCount}`);
  console.log(`   Duplicates skipped          : ${duplicateCount}`);
  
  const authorsWithEmail = authorsToProcess.filter(a => a.email).length;
  console.log(`   Authors with email          : ${authorsWithEmail}`);
  console.log(`   Authors without email       : ${authorsToProcess.length - authorsWithEmail}`);

  if (authorsToProcess.length === 0) {
    console.log("No authors to migrate. Exiting.");
    return;
  }

  // Sort by priority
  authorsToProcess.sort((a, b) => a.priority - b.priority);

  let usersCreated = 0;
  let usersExisting = 0;
  let profilesCreated = 0;
  let profilesUpdated = 0;
  let rolesCreated = 0;
  let rolesExisting = 0;
  let authorsInserted = 0;
  let authorsUpdated = 0;
  let errors = 0;
  const errorDetails: { name: string; error: string }[] = [];

  const batchSize = 25;
  for (let i = 0; i < authorsToProcess.length; i += batchSize) {
    const batch = authorsToProcess.slice(i, i + batchSize);

    for (const author of batch) {
      try {
        let userId: string | undefined = undefined;
        const fallbackEmail = generateRandomMigratedEmail(author.username || author.name);
        const userEmail = (author.email || fallbackEmail).toLowerCase();

        // ============================================
        // STEP 1: Create or find User
        // ============================================
        if (author.email) {
          const emailClash = await prisma.author.findFirst({
            where: {
              email: author.email,
              id: { not: author.authorId },
            },
            select: { id: true },
          });
          if (emailClash) duplicateEmailCount++;
        }

        const existingUser = await prisma.user.findUnique({ where: { email: userEmail } });

        if (existingUser) {
          usersExisting++;
          userId = existingUser.id;
        } else {
          const passwordHash =
            author.password && author.password !== ""
              ? author.password
              : SOCIAL_PASSWORD_HASH;

          const newUser = await prisma.user.create({
            data: {
              email: userEmail,
              password_hash: passwordHash,
              email_verified: Boolean(author.email),
              created_at: author.created_at,
              updated_at: author.updated_at,
            },
          });

          usersCreated++;
          userId = newUser.id;
        }

        // ============================================
        // STEP 2: Create or Update Profile (if user exists)
        // ============================================
        if (userId) {
          const existingProfile = await prisma.profile.findUnique({
            where: { user_id: userId },
          });

          const profileData = {
            full_name: author.name,
            display_name: author.username || author.name,
            phone: author.phone,
            avatar_url: author.avatar_url,
            bio: author.bio,
            is_active: author.status === "active",
            facebook_url: author.facebook_url,
            instagram_url: author.instagram_url,
            youtube_url: author.youtube_url,
            website_url: author.website_url,
            created_at: author.created_at,
            updated_at: author.updated_at,
          };

          if (existingProfile) {
            await prisma.profile.update({
              where: { user_id: userId },
              data: profileData,
            });
            profilesUpdated++;
          } else {
            await prisma.profile.create({
              data: {
                ...profileData,
                user_id: userId,
              },
            });
            profilesCreated++;
          }
        }

        // ============================================
        // STEP 3: Create UserRole (if user exists)
        // ============================================
        if (userId) {
          const existingRole = await prisma.userRole.findUnique({
            where: {
              user_id_role: {
                user_id: userId,
                role: AppRole.writer,
              },
            },
          });

          if (!existingRole) {
            await prisma.userRole.create({
              data: {
                user_id: userId,
                role: AppRole.writer,
              },
            });
            rolesCreated++;
          } else {
            rolesExisting++;
          }
        }

        // ============================================
        // STEP 4: Create or Update Author
        // ============================================
        const existingAuthor = await prisma.author.findFirst({
          where: {
            OR: [
              { id: author.authorId },
              { email: userEmail },
              { name: author.name }
            ]
          },
        });

        const authorData = {
          name: author.name,
          name_en: author.name_en,
          bio: author.bio,
          avatar_url: author.avatar_url,
          email: userEmail,
          phone: author.phone,
          priority: author.priority,
          status: author.status,
          created_at: author.created_at,
          updated_at: author.updated_at,
          user_id: userId,
        };

        if (existingAuthor) {
          await prisma.author.update({
            where: { id: existingAuthor.id },
            data: authorData,
          });
          authorsUpdated++;
        } else {
          await prisma.author.create({
            data: {
              id: author.authorId,
              ...authorData,
            },
          });
          authorsInserted++;
        }

        if ((authorsInserted + authorsUpdated) % 50 === 0) {
          console.log(`Processed ${authorsInserted + authorsUpdated} authors...`);
        }
      } catch (error: unknown) {
        errors++;
        const message = error instanceof Error ? error.message : String(error);
        errorDetails.push({ name: author.name, error: message });
        console.error(`Failed to process author "${author.name}":`, message);
      }
    }
  }

  // Final hard guarantee: no author should remain without user_id
  let backfilledUserLinks = 0;
  const orphanAuthors = await prisma.author.findMany({
    where: { user_id: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      bio: true,
      avatar_url: true,
      created_at: true,
      updated_at: true,
    },
  });

  for (const orphan of orphanAuthors) {
    try {
      const email = (normalizeText(orphan.email) || generateRandomMigratedEmail(orphan.name)).toLowerCase();
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
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
          avatar_url: orphan.avatar_url,
          bio: orphan.bio,
          is_active: true,
        },
        create: {
          user_id: user.id,
          full_name: orphan.name,
          display_name: orphan.name,
          phone: orphan.phone,
          avatar_url: orphan.avatar_url,
          bio: orphan.bio,
          is_active: true,
          created_at: orphan.created_at,
          updated_at: orphan.updated_at,
        },
      });

      await prisma.userRole.upsert({
        where: {
          user_id_role: {
            user_id: user.id,
            role: AppRole.writer,
          },
        },
        update: {},
        create: {
          user_id: user.id,
          role: AppRole.writer,
        },
      });

      await prisma.author.update({
        where: { id: orphan.id },
        data: {
          user_id: user.id,
          email,
        },
      });

      backfilledUserLinks++;
    } catch (error) {
      errors++;
      const message = error instanceof Error ? error.message : String(error);
      errorDetails.push({ name: orphan.name, error: `Backfill failed: ${message}` });
      console.error(`Failed to backfill user for author "${orphan.name}":`, message);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`MIGRATION SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  
  console.log(`\nUSERS:`);
  console.log(`   New users created     : ${usersCreated}`);
  console.log(`   Existing users found  : ${usersExisting}`);
  
  console.log(`\nPROFILES:`);
  console.log(`   New profiles created  : ${profilesCreated}`);
  console.log(`   Existing profiles updated: ${profilesUpdated}`);
  
  console.log(`\nUSER ROLES:`);
  console.log(`   New author roles      : ${rolesCreated}`);
  console.log(`   Existing roles found  : ${rolesExisting}`);
  
  console.log(`\nAUTHORS:`);
  console.log(`   Successfully inserted : ${authorsInserted}`);
  console.log(`   Successfully updated  : ${authorsUpdated}`);
  console.log(`   Backfilled user links : ${backfilledUserLinks}`);
  console.log(`   Failed                : ${errors}`);

  if (errorDetails.length > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ERROR DETAILS (First 10 of ${errorDetails.length})`);
    console.log(`${"=".repeat(60)}`);
    errorDetails.slice(0, 10).forEach(({ name, error }) => {
      console.log(`   - ${name}: ${error.substring(0, 150)}...`);
    });
  }

  // Print author priority order
  console.log(`\n${"=".repeat(60)}`);
  console.log(`AUTHOR PRIORITY ORDER (Top 20)`);
  console.log(`${"=".repeat(60)}`);
  authorsToProcess.slice(0, 20).forEach((author, idx) => {
    const hasUser = "Yes";
    console.log(`${(idx + 1).toString().padStart(2)}. [${hasUser}] ${author.name.padEnd(30)} (Priority: ${author.priority})`);
  });

  // Final statistics
  console.log(`\n${"=".repeat(60)}`);
  console.log(`FINAL STATISTICS`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total authors in CSV      : ${authorsToProcess.length}`);
  console.log(`Authors with user accounts: ${authorsWithEmail}`);
  console.log(`Authors without email     : ${authorsToProcess.length - authorsWithEmail}`);
  console.log(`Duplicate email collisions: ${duplicateEmailCount}`);
  
  if (authorsToProcess.length - authorsWithEmail > 0) {
    console.log(`\nNote: ${authorsToProcess.length - authorsWithEmail} authors don't have email addresses`);
    console.log(`Fallback emails were generated so linked user accounts were still created.`);
    console.log(`Consider adding real emails later if needed.`);
  }
}

// Run migration
migrateAuthors()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());