// Write Success rows to outputs/report.xlsx and mirror everything into Postgres.
//
// Failure rows are written immediately by stages 01-08 via lib/error-log.ts.
// This stage:
//   1. Appends Success rows for jobs that produced a merged attachment PDF.
//   2. Uploads final merged attachment PDFs to MinIO.
//   3. Reads the full report.xlsx and upserts every row into the database.
//   4. Leaves assets/jobs/jobs.xlsx in place so input data is never cleaned.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { closePool, slugifyDb, upsertJob, upsertRole, withClient } from "../lib/db-client";
import { appendSuccessForPath } from "../lib/error-log";
import { log } from "../lib/logging";
import { uploadPdfs } from "../lib/minio-client";
import { JOBS_XLSX_PATH, OUTPUTS_DIR, REPORT_XLSX_PATH } from "../lib/paths";

const STAGE = "report";
const IN_DIR = path.join(OUTPUTS_DIR, "attachment", "pdf");

function* walkPdfs(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkPdfs(full);
    else if (entry.isFile() && path.extname(full).toLowerCase() === ".pdf") yield full;
  }
}

async function ingestReportToDb(): Promise<void> {
  if (!fs.existsSync(REPORT_XLSX_PATH)) {
    log(STAGE, `no ${REPORT_XLSX_PATH} - skipping db ingestion`);
    return;
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(REPORT_XLSX_PATH);
  } catch (e) {
    log(STAGE, `cannot read ${REPORT_XLSX_PATH} (${(e as Error).message}) - skipping db ingestion`);
    return;
  }
  let rolesSeen = 0;
  let jobsUpserted = 0;
  try {
    await withClient(async (c) => {
      for (const ws of wb.worksheets) {
        const sheetTitle = ws.name || "report";
        const roleId = await upsertRole(c, sheetTitle, slugifyDb(sheetTitle));
        rolesSeen++;
        if (ws.rowCount < 1) continue;
        const headerRow = ws.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell({ includeEmpty: true }, (cell) => {
          headers.push(cell.value == null ? "" : String(cell.value));
        });
        const idx: Record<string, number> = {};
        headers.forEach((h, i) => {
          if (h) idx[h] = i;
        });
        if (!("url" in idx)) continue;
        for (let r = 2; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const values: unknown[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => values.push(cell.value));
          const url = String(values[idx.url] ?? "").trim();
          if (!url) continue;
          const company = "company_name" in idx ? values[idx.company_name] : null;
          const title = "job_role" in idx ? values[idx.job_role] : null;
          const posted = "posted_date" in idx ? values[idx.posted_date] : null;
          const statusKey = "pipeline_status" in idx ? "pipeline_status" : "status";
          const pipelineStatus = statusKey in idx ? values[idx[statusKey]] : "";
          const cv = "cv" in idx ? values[idx.cv] : "";
          try {
            await upsertJob(c, roleId, company, title, posted, url, pipelineStatus, cv);
            jobsUpserted++;
          } catch (e) {
            log(STAGE, `skip ${url}: ${(e as Error).message}`);
          }
        }
      }
    });
  } catch (e) {
    log(STAGE, `db connect failed (${(e as Error).message}) - skipping db ingestion`);
    return;
  }
  log(STAGE, `db: upserted ${rolesSeen} role(s), ${jobsUpserted} job row(s)`);
}

export async function runStage(): Promise<number> {
  let pdfs: string[] = [];
  if (!fs.existsSync(IN_DIR) || !fs.statSync(IN_DIR).isDirectory()) {
    log(STAGE, `no attachments at ${IN_DIR} - nothing to report`);
  } else {
    pdfs = [...walkPdfs(IN_DIR)].sort();
    const cvKeys = await uploadPdfs(pdfs, IN_DIR);
    for (const pdf of pdfs) {
      await appendSuccessForPath(pdf, IN_DIR, cvKeys.get(pdf) ?? "");
    }
    log(STAGE, `wrote ${pdfs.length} success entries to ${REPORT_XLSX_PATH}`);
  }
  await ingestReportToDb();
  if (fs.existsSync(JOBS_XLSX_PATH)) {
    log(STAGE, `kept ${JOBS_XLSX_PATH}`);
  }
  await closePool();
  return 0;
}
