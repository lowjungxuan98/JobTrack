import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { slugify } from "./values";

export interface JobRow {
  sheet_name?: string;
  sheet_slug?: string;
  title?: string;
  company?: string;
  url?: string;
  location?: string;
  posted_date?: string | null;
  source?: string | null;
  [key: string]: unknown;
}

export function dedupByUrl(rows: Iterable<JobRow>): JobRow[] {
  const seen = new Set<string>();
  const out: JobRow[] = [];
  for (const row of rows) {
    const url = row.url;
    const key = `${row.sheet_slug || ""}::${url}`;
    if (url && !seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

export function rowRelpath(row: JobRow): string {
  const sheetDir = row.sheet_slug || slugify(row.sheet_name || "sheet");
  const suffix = row.url ? `-${urlSuffix(row.url)}` : "";
  const slug = `${slugify(row.company || "")}-${slugify(row.title || "")}${suffix}`.replace(/^-+|-+$/g, "");
  return path.join(sheetDir, `${slug}.json`);
}

function urlSuffix(url: string): string {
  const match = url.match(/_((?:JR)?\d+(?:-\d+)?)\b/i);
  if (match) return slugify(match[1]);
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 8);
}

export function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}

export function loadRowsJsonl(filepath: string): JobRow[] {
  return fs
    .readFileSync(filepath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as JobRow);
}

export function writeRowsJsonl(filepath: string, rows: JobRow[]): string {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const lines = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  fs.writeFileSync(filepath, lines, "utf8");
  return filepath;
}
