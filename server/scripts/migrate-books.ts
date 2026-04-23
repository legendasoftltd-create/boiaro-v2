import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { BookFormatType, PrismaClient } from "../src/generated/prisma/index.js";
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
  access_type?: string;
  name?: string;
  language?: string;
  description?: string;
  categoryId?: string;
  authorId?: string;
  publisherId?: string;
  image?: string;
  pdf?: string;
  preview_pdf?: string;
  type?: string;
  pages?: string;
  is_active?: string;
  createdAt?: string;
  updatedAt?: string;
  price?: string;
  featured?: string;
  published_date?: string;
  status?: string;
  [key: string]: string | undefined;
}

interface AuthorCsvRow {
  _id?: string;
  name?: string;
  email?: string;
}

interface PublisherCsvRow {
  _id?: string;
  name?: string;
  email?: string;
}

function normalizeText(value?: string): string | null {
  const v = (value || "").trim();
  return v.length ? v : null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function toBool(v?: string): boolean {
  const x = (v || "").trim().toLowerCase();
  return x === "1" || x === "true" || x === "yes";
}

function isFreeAccessType(accessType?: string): boolean {
  const value = (accessType || "").trim().toLowerCase();
  return value === "free";
}

function toUploadPath(fileName: string | null, folder: "bookPdf" | "bookImages"): string | null {
  if (!fileName) return null;
  const cleaned = fileName.trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned;
  if (cleaned.startsWith("/uploads/")) return cleaned;
  const onlyName = cleaned.split("/").pop() || cleaned;
  return `/uploads/${folder}/${onlyName}`;
}

function extractEbookChapters(row: CsvRow): Array<{
  chapter_title: string;
  chapter_order: number;
  file_url: string | null;
  is_preview: boolean;
}> {
  const chapterMap = new Map<
    number,
    { title?: string; order?: number; file?: string | null; is_preview?: boolean }
  >();

  for (const [key, raw] of Object.entries(row)) {
    const match = key.match(/^chapters\[(\d+)\]\.(title|order|file|is_preview)$/);
    if (!match) continue;
    const idx = parseInt(match[1], 10);
    const field = match[2];
    const existing = chapterMap.get(idx) || {};
    const value = typeof raw === "string" ? raw.trim() : "";

    if (field === "title") existing.title = value || undefined;
    if (field === "order") existing.order = value ? parseInt(value, 10) : undefined;
    if (field === "file") existing.file = toUploadPath(value || null, "bookPdf");
    if (field === "is_preview") existing.is_preview = value.toLowerCase() === "true" || value === "1";

    chapterMap.set(idx, existing);
  }

  const chapters = Array.from(chapterMap.entries())
    .map(([idx, c]) => {
      const chapter_order = c.order ?? idx + 1;
      const chapter_title = c.title || `Chapter ${chapter_order}`;
      return {
        chapter_title,
        chapter_order,
        file_url: c.file || null,
        is_preview: Boolean(c.is_preview),
      };
    })
    .sort((a, b) => a.chapter_order - b.chapter_order);

  return chapters;
}

async function migrateBooks() {
  const rows: CsvRow[] = [];
  const authorRows: AuthorCsvRow[] = [];
  const publisherRows: PublisherCsvRow[] = [];
  const csvPath = path.join(__dirname, "..", "data", "books.csv");
  const authorsCsvPath = path.join(__dirname, "..", "data", "authors.csv");
  const publishersCsvPath = path.join(__dirname, "..", "data", "publishers.csv");
  if (!fs.existsSync(csvPath)) throw new Error(`books.csv not found at ${csvPath}`);
  if (!fs.existsSync(authorsCsvPath)) throw new Error(`authors.csv not found at ${authorsCsvPath}`);
  if (!fs.existsSync(publishersCsvPath)) throw new Error(`publishers.csv not found at ${publishersCsvPath}`);

  await Promise.all([
    new Promise<void>((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on("data", (row: CsvRow) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    }),
    new Promise<void>((resolve, reject) => {
      fs.createReadStream(authorsCsvPath)
        .pipe(csv())
        .on("data", (row: AuthorCsvRow) => authorRows.push(row))
        .on("end", resolve)
        .on("error", reject);
    }),
    new Promise<void>((resolve, reject) => {
      fs.createReadStream(publishersCsvPath)
        .pipe(csv())
        .on("data", (row: PublisherCsvRow) => publisherRows.push(row))
        .on("end", resolve)
        .on("error", reject);
    }),
  ]);

  const [authors, categories, publishers] = await Promise.all([
    prisma.author.findMany({ select: { id: true, name: true, email: true } }),
    prisma.category.findMany({ select: { id: true } }),
    prisma.publisher.findMany({ select: { id: true, name: true, email: true } }),
  ]);

  const categorySet = new Set(categories.map((x) => x.id));

  const authorById = new Map(authors.map((a) => [a.id, a.id]));
  const authorByEmail = new Map(
    authors
      .filter((a) => normalizeText(a.email))
      .map((a) => [a.email!.toLowerCase(), a.id])
  );
  const authorByName = new Map(
    authors
      .filter((a) => normalizeText(a.name))
      .map((a) => [a.name.trim().toLowerCase(), a.id])
  );

  const publisherById = new Map(publishers.map((p) => [p.id, p.id]));
  const publisherByEmail = new Map(
    publishers
      .filter((p) => normalizeText(p.email))
      .map((p) => [p.email!.toLowerCase(), p.id])
  );
  const publisherByName = new Map(
    publishers
      .filter((p) => normalizeText(p.name))
      .map((p) => [p.name.trim().toLowerCase(), p.id])
  );

  const authorLegacyToActual = new Map<string, string>();
  for (const legacy of authorRows) {
    const legacyId = normalizeText(legacy._id);
    if (!legacyId) continue;
    const email = normalizeText(legacy.email)?.toLowerCase() || null;
    const name = normalizeText(legacy.name)?.toLowerCase() || null;
    const resolved =
      authorById.get(legacyId) ||
      (email ? authorByEmail.get(email) : undefined) ||
      (name ? authorByName.get(name) : undefined);
    if (resolved) authorLegacyToActual.set(legacyId, resolved);
  }

  const publisherLegacyToActual = new Map<string, string>();
  for (const legacy of publisherRows) {
    const legacyId = normalizeText(legacy._id);
    if (!legacyId) continue;
    const email = normalizeText(legacy.email)?.toLowerCase() || null;
    const name = normalizeText(legacy.name)?.toLowerCase() || null;
    const resolved =
      publisherById.get(legacyId) ||
      (email ? publisherByEmail.get(email) : undefined) ||
      (name ? publisherByName.get(name) : undefined);
    if (resolved) publisherLegacyToActual.set(legacyId, resolved);
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const title = normalizeText(row.name);
      if (!title || row.is_active === "0") {
        skipped++;
        continue;
      }

      const id = normalizeText(row._id) || crypto.randomUUID();
      const baseSlug = slugify(title) || `book-${id.slice(0, 8)}`;
      const slug = `${baseSlug}-${id.slice(0, 8)}`;
      const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
      const updatedAt = row.updatedAt ? new Date(row.updatedAt) : new Date();
      const cover = normalizeText(row.image);
      const cover_url = toUploadPath(cover, "bookImages");
      const file_url = toUploadPath(normalizeText(row.pdf), "bookPdf");
      const isFreeBook = isFreeAccessType(row.access_type);
      const parsedPrice = row.price ? Math.max(0, parseFloat(row.price) || 0) : 0;
      const effectivePrice = isFreeBook ? 0 : parsedPrice;
      const effectiveCoinPrice = isFreeBook ? 0 : Math.trunc(parsedPrice);
      const chapterRows = extractEbookChapters(row);
      const categoryId = normalizeText(row.categoryId);
      const legacyAuthorId = normalizeText(row.authorId);
      const legacyPublisherId = normalizeText(row.publisherId);
      const resolvedAuthorId = legacyAuthorId
        ? authorLegacyToActual.get(legacyAuthorId) || authorById.get(legacyAuthorId) || null
        : null;
      const resolvedPublisherId = legacyPublisherId
        ? publisherLegacyToActual.get(legacyPublisherId) || publisherById.get(legacyPublisherId) || null
        : null;

      const existed = Boolean(await prisma.book.findUnique({ where: { id }, select: { id: true } }));

      await prisma.book.upsert({
        where: { id },
        update: {
          title,
          title_en: null,
          slug,
          description: normalizeText(row.description),
          description_bn: normalizeText(row.description),
          language: normalizeText(row.language),
          cover_url,
          coin_price: effectiveCoinPrice,
          is_free: isFreeBook,
          is_featured: toBool(row.featured),
          submission_status: normalizeText(row.status) || "pending",
          published_date: row.published_date ? new Date(row.published_date) : null,
          author_id: resolvedAuthorId,
          category_id: categoryId && categorySet.has(categoryId) ? categoryId : null,
          publisher_id: resolvedPublisherId,
          tags: [],
        },
        create: {
          id,
          title,
          title_en: null,
          slug,
          description: normalizeText(row.description),
          description_bn: normalizeText(row.description),
          language: normalizeText(row.language),
          cover_url,
          coin_price: effectiveCoinPrice,
          is_free: isFreeBook,
          is_featured: toBool(row.featured),
          submission_status: normalizeText(row.status) || "pending",
          published_date: row.published_date ? new Date(row.published_date) : null,
          author_id: resolvedAuthorId,
          category_id: categoryId && categorySet.has(categoryId) ? categoryId : null,
          publisher_id: resolvedPublisherId,
          tags: [],
          created_at: createdAt,
          updated_at: updatedAt,
        },
      });

      // Keep only ebook format and migrate ebook file path.
      const existingEbookFormat = await prisma.bookFormat.findFirst({
        where: { book_id: id, format: BookFormatType.ebook },
        select: { id: true },
      });

      let ebookFormatId: string;
      if (existingEbookFormat) {
        await prisma.bookFormat.update({
          where: { id: existingEbookFormat.id },
          data: {
            format: BookFormatType.ebook,
            file_url,
            pages: row.pages ? Math.max(0, parseInt(row.pages, 10) || 0) : null,
            price: effectivePrice,
            is_available: true,
            submission_status: normalizeText(row.status) || "pending",
            publisher_id: resolvedPublisherId,
          },
        });
        ebookFormatId = existingEbookFormat.id;
      } else {
        const createdFormat = await prisma.bookFormat.create({
          data: {
            book_id: id,
            format: BookFormatType.ebook,
            file_url,
            pages: row.pages ? Math.max(0, parseInt(row.pages, 10) || 0) : null,
            price: effectivePrice,
            is_available: true,
            submission_status: normalizeText(row.status) || "pending",
            publisher_id: resolvedPublisherId,
            created_at: createdAt,
            updated_at: updatedAt,
          },
        });
        ebookFormatId = createdFormat.id;
      }

      // Sync ebook chapters from CSV chapter columns.
      await prisma.ebookChapter.deleteMany({
        where: { book_format_id: ebookFormatId },
      });
      if (chapterRows.length > 0) {
        await prisma.ebookChapter.createMany({
          data: chapterRows.map((ch) => ({
            book_format_id: ebookFormatId,
            chapter_title: ch.chapter_title,
            chapter_order: ch.chapter_order,
            file_url: ch.file_url,
            status: "published",
            created_at: createdAt,
            updated_at: updatedAt,
          })),
        });
      }

      // Enforce ebook-only formats for migrated books.
      await prisma.bookFormat.deleteMany({
        where: {
          book_id: id,
          NOT: { format: BookFormatType.ebook },
        },
      });

      if (existed) updated++;
      else inserted++;
    } catch (error) {
      failed++;
      console.error("Failed book row:", error);
    }
  }

  console.log(`Books inserted: ${inserted}`);
  console.log(`Books updated : ${updated}`);
  console.log(`Books skipped : ${skipped}`);
  console.log(`Books failed  : ${failed}`);
}

migrateBooks()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
