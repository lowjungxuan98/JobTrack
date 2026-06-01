// Rebuild a jobs.xlsx from failed entries.
//
// Used by `npm run job-ops:retry` to re-run jobs that failed in a previous
// pipeline run. The normal source of truth is Postgres.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { fetchFailedJobsByRole, type FailedJobRow } from "./db-client";

const HEADERS = ["job_title", "company", "location", "url", "posted_date", "source_platforms"] as const;
const REPORT_HEADERS = new Set(["company_name", "job_role", "posted_date", "url"]);

function sourceFromUrl(url: string | null | undefined): string {
  const u = (url ?? "").toLowerCase();
  if (u.includes("linkedin.")) return "LinkedIn";
  if (u.includes("indeed.")) return "Indeed";
  return "";
}

export async function failedRowsBySheet(reportPath: string): Promise<Record<string, FailedJobRow[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(reportPath);
  const out: Record<string, FailedJobRow[]> = {};
  for (const ws of wb.worksheets) {
    const rowCount = ws.rowCount;
    if (rowCount < 1) continue;
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      headers.push(cell.value == null ? "" : String(cell.value));
    });
    const idx: Record<string, number> = {};
    headers.forEach((h, i) => {
      if (h) idx[h] = i;
    });
    if (![...REPORT_HEADERS].every((h) => h in idx)) continue;
    const statusKey = "pipeline_status" in idx ? "pipeline_status" : "status" in idx ? "status" : null;
    if (!statusKey) continue;
    for (let r = 2; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => values.push(cell.value));
      const status = String(values[idx[statusKey]] ?? "");
      if (!status.toLowerCase().startsWith("failed")) continue;
      const url = values[idx.url];
      (out[ws.name] ??= []).push({
        job_title: String(values[idx.job_role] ?? "") || null,
        company: String(values[idx.company_name] ?? "") || null,
        location: "",
        url: url == null ? null : String(url),
        posted_date: (values[idx.posted_date] as string | Date | null) ?? null,
      });
    }
  }
  return out;
}

export async function writeRetryXlsx(
  rowsBySheet: Record<string, FailedJobRow[]>,
  outPath: string,
): Promise<number> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const wb = new ExcelJS.Workbook();
  let total = 0;
  const sheetNames = Object.keys(rowsBySheet);
  for (const sheetName of sheetNames) {
    const rows = rowsBySheet[sheetName];
    const ws = wb.addWorksheet((sheetName || "sheet").slice(0, 31));
    ws.addRow([...HEADERS]);
    for (const row of rows) {
      ws.addRow([
        row.job_title ?? "",
        row.company ?? "",
        row.location ?? "",
        row.url ?? "",
        row.posted_date ?? "",
        sourceFromUrl(row.url),
      ]);
      total++;
    }
  }
  if (!wb.worksheets.length) wb.addWorksheet("empty").addRow([...HEADERS]);
  await wb.xlsx.writeFile(outPath);
  return total;
}

export async function buildRetryXlsxFromDb(outPath: string): Promise<number> {
  return writeRetryXlsx(await fetchFailedJobsByRole(), outPath);
}
