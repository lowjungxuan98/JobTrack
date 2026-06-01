// Centralized error/status reporting for the workflow pipeline.
//
// Writes per-job rows to outputs/report.xlsx with columns:
//     company_name, job_role, posted_date, url, cv, pipeline_status
//
// Stages 01-08 call appendFailure* when a job fails. Stage 09 calls
// appendSuccessForPath for jobs that reached the final attachment.
// Rows are deduped by url so re-runs overwrite the prior pipeline_status.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { OUTPUTS_DIR, REPORT_XLSX_PATH } from "./paths";

const ANALYZE_DIR = path.join(OUTPUTS_DIR, "analyze");
const HEADERS = ["company_name", "job_role", "posted_date", "url", "cv", "pipeline_status"] as const;
const DEFAULT_SHEET = "report";
const INVALID_SHEET_CHARS = new Set(["[", "]", ":", "*", "?", "/", "\\"]);

function sanitizeSheetName(name: unknown): string {
  const text = name == null || name === "" ? "" : String(name).trim();
  if (!text) return DEFAULT_SHEET;
  const cleaned = [...text].filter((c) => !INVALID_SHEET_CHARS.has(c)).join("").slice(0, 31);
  return cleaned || DEFAULT_SHEET;
}

let writeChain: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeChain;
  let release!: () => void;
  writeChain = new Promise<void>((r) => (release = r));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function openWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(REPORT_XLSX_PATH)) {
    await wb.xlsx.readFile(REPORT_XLSX_PATH);
  } else {
    fs.mkdirSync(path.dirname(REPORT_XLSX_PATH), { recursive: true });
  }
  return wb;
}

function getSheet(wb: ExcelJS.Workbook, sheetName: string): ExcelJS.Worksheet {
  const title = sanitizeSheetName(sheetName);
  const existing = wb.getWorksheet(title);
  if (existing) return existing;
  const ws = wb.addWorksheet(title);
  ws.addRow([...HEADERS]);
  return ws;
}

function ensureHeaders(ws: ExcelJS.Worksheet): Record<string, number> {
  if (ws.rowCount === 0) {
    ws.addRow([...HEADERS]);
  }
  const headerRow = ws.getRow(1);
  const current: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    current.push(cell.value == null ? "" : String(cell.value));
  });
  for (const header of HEADERS) {
    if (!current.includes(header)) {
      headerRow.getCell(current.length + 1).value = header;
      current.push(header);
    }
  }
  headerRow.commit();
  const idx: Record<string, number> = {};
  current.forEach((h, i) => {
    if (h) idx[h] = i + 1;
  });
  return idx;
}

async function writeRow(
  company: unknown,
  role: unknown,
  posted: unknown,
  url: unknown,
  status: string,
  sheetName: unknown,
  cv: unknown = "",
): Promise<void> {
  await withLock(async () => {
    const wb = await openWorkbook();
    const ws = getSheet(wb, sanitizeSheetName(sheetName));
    const headerIdx = ensureHeaders(ws);
    const urlCol = headerIdx.url ?? 4;
    if (url) {
      // Remove prior row(s) with same URL.
      for (let r = ws.rowCount; r > 1; r--) {
        const v = ws.getRow(r).getCell(urlCol).value;
        if (v === url) ws.spliceRows(r, 1);
      }
    }
    const values: Record<string, unknown> = {
      company_name: company ?? "",
      job_role: role ?? "",
      posted_date: posted ?? "",
      url: url ?? "",
      cv: cv ?? "",
      pipeline_status: status,
    };
    const maxCol = Math.max(...Object.values(headerIdx));
    const row: unknown[] = Array(maxCol).fill("");
    for (const [header, value] of Object.entries(values)) {
      if (header in headerIdx) row[headerIdx[header] - 1] = value;
    }
    ws.addRow(row);
    await wb.xlsx.writeFile(REPORT_XLSX_PATH);
  });
}

function rel(filepath: string, inDir: string): string {
  const r = path.relative(path.resolve(inDir), path.resolve(filepath));
  return r.startsWith("..") || path.isAbsolute(r) ? path.basename(filepath) : r;
}

function lookupAnalyze(relpath: string): Record<string, unknown> {
  const candidates = [path.join(ANALYZE_DIR, relpath)];
  if (path.extname(relpath).toLowerCase() !== ".json") {
    candidates.push(path.join(ANALYZE_DIR, relpath.replace(/\.[^.]+$/, "") + ".json"));
  }
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      try {
        const data = JSON.parse(fs.readFileSync(c, "utf8"));
        return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
  }
  return {};
}

export function appendFailureForRow(row: Record<string, unknown>, stageLabel: string): Promise<void> {
  return writeRow(
    row.company,
    row.title,
    row.posted_date,
    row.url,
    `Failed at ${stageLabel}`,
    row.sheet_name ?? row.sheet_slug,
  );
}

export function appendFailureForPath(filepath: string, inDir: string, stageLabel: string): Promise<void> {
  const rec = lookupAnalyze(rel(filepath, inDir));
  return writeRow(
    rec.company,
    rec.title,
    rec.posted_date,
    rec.job_url,
    `Failed at ${stageLabel}`,
    rec.sheet_name ?? rec.sheet_slug,
  );
}

export function appendSuccessForPath(filepath: string, inDir: string, cv = ""): Promise<void> {
  const rec = lookupAnalyze(rel(filepath, inDir));
  return writeRow(
    rec.company,
    rec.title,
    rec.posted_date,
    rec.job_url,
    "Success",
    rec.sheet_name ?? rec.sheet_slug,
    cv,
  );
}
