import fs from "fs";
import path from "path";
import csv from "csv-parser";

export type CsvRow = Record<string, string>;

export type SeedCounters = {
  inserted: number;
  updated: number;
  skipped: number;
};

export function createCounters(): SeedCounters {
  return { inserted: 0, updated: 0, skipped: 0 };
}

export async function readCsvRows(csvPath: string): Promise<CsvRow[]> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const rows: CsvRow[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CsvRow) => rows.push(row))
      .on("end", () => resolve())
      .on("error", (err: unknown) => reject(err));
  });

  return rows;
}

export function dataCsvPath(fileName: string): string {
  return path.join(process.cwd(), "data", "tables-data", fileName);
}

export function asNullableString(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function asBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function asInt(value: string | undefined, fallback = 0): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

export function asFloat(value: string | undefined, fallback = 0): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? fallback : n;
}

export function asDate(value: string | undefined): Date | undefined {
  if (!value || value.trim() === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseStringArray(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    // ignore and fallback
  }
  return [];
}
