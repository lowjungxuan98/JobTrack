// Read a job-postings xlsx and emit normalized job rows.
//
// Expected headers in row 1 (case-sensitive):
//   job_title, company, location, posted, posted_date, job_id,
//   matched_search_terms, url, source_platforms, duplicate_count
//
// Each row is normalized to:
//   sheet_name, sheet_slug, title, company, location, url,
//   posted_date (YYYY-MM-DD), source (TitleCase)
import ExcelJS from "exceljs";

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const REQUIRED = ["job_title", "company", "location", "url", "posted_date", "source_platforms"];

// Format dates in a fixed timezone so calendar-date cells (which Excel stores as
// local-midnight equivalents) round-trip correctly regardless of the host TZ.
// Override with POSTED_DATE_TZ if jobs come from a different region.
const POSTED_DATE_TZ = process.env.POSTED_DATE_TZ ?? "Asia/Singapore";
const POSTED_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: POSTED_DATE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface ExtractedRow {
  sheet_name: string;
  sheet_slug: string;
  title: string;
  company: string;
  location: string;
  url: string;
  posted_date: string | null;
  source: string | null;
  [key: string]: unknown;
}

export function excelSerialToIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return POSTED_DATE_FMT.format(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return POSTED_DATE_FMT.format(new Date(EXCEL_EPOCH + n * 86400000));
}

function normalizeSource(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const titled = str
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return titled === "Linkedin" ? "LinkedIn" : titled;
}

export function sheetSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "sheet";
}

function cellValue(cell: ExcelJS.Cell | undefined): unknown {
  if (!cell) return null;
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v) return (v.richText as { text: string }[]).map((r) => r.text).join("");
    if ("result" in v) return (v as { result: unknown }).result;
    if (v instanceof Date) return v;
  }
  return v as unknown;
}

export async function extractRows(filepath: string): Promise<ExtractedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filepath);
  const out: ExtractedRow[] = [];
  for (const ws of wb.worksheets) {
    const rowsIter = ws.getRows(1, ws.rowCount + 1) ?? [];
    if (!rowsIter.length) continue;
    const headerRow = rowsIter[0];
    if (!headerRow) continue;
    const header: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      const v = cellValue(cell);
      header.push(v == null ? "" : String(v).trim());
    });
    if (!header.some(Boolean)) continue;
    const idx: Record<string, number> = {};
    header.forEach((name, i) => {
      if (name) idx[name] = i;
    });
    const missing = REQUIRED.filter((c) => !(c in idx));
    if (missing.length) {
      throw new Error(`sheet '${ws.name}' missing columns: ${missing.join(", ")}`);
    }
    const slug = sheetSlug(ws.name);
    for (let i = 1; i < rowsIter.length; i++) {
      const row = rowsIter[i];
      if (!row) continue;
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(cellValue(cell));
      });
      if (values.every((v) => v == null || v === "")) continue;
      out.push({
        sheet_name: ws.name,
        sheet_slug: slug,
        title: String(values[idx.job_title] ?? "").trim(),
        company: String(values[idx.company] ?? "").trim(),
        location: String(values[idx.location] ?? "").trim(),
        url: String(values[idx.url] ?? "").trim(),
        posted_date: excelSerialToIso(values[idx.posted_date]),
        source: normalizeSource(values[idx.source_platforms]),
      });
    }
  }
  return out;
}
