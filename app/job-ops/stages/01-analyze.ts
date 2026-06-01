// Analyze multi-sheet job xlsx rows into outputs/analyze/<sheet>/<job>.json.
import fs from "node:fs";
import path from "node:path";
import { dedupByUrl, loadRowsJsonl, rowRelpath, type JobRow } from "../lib/batch";
import { chatWebsearch } from "../lib/codex-client";
import { appendFailureForRow } from "../lib/error-log";
import { writeJson } from "../lib/files";
import { llmJson } from "../lib/llm";
import { log } from "../lib/logging";
import { JOBS_XLSX_PATH, OUTPUTS_DIR, repoPath } from "../lib/paths";
import { render } from "../lib/prompt";
import { loadPromptOrLog, runParallel } from "../lib/stage-utils";
import { strList } from "../lib/values";
import { extractRows } from "../lib/xlsx-extract";

const STAGE = "analyze";
const OUT_DIR = path.join(OUTPUTS_DIR, "analyze");

function buildRecord(row: JobRow, llm: Record<string, unknown>): Record<string, unknown> {
  let description: string[] = [];
  if (typeof llm.description === "string") {
    description = llm.description.split(/\n\s*\n/).filter(Boolean);
  } else {
    description = strList(llm.description);
  }
  const salary = llm.salary;
  return {
    sheet_name: row.sheet_name,
    sheet_slug: row.sheet_slug,
    source: row.source,
    title: row.title,
    company: row.company,
    location: row.location,
    job_url: row.url,
    posted_date: row.posted_date,
    description,
    requirements: strList(llm.requirements),
    salary: salary === "" || salary == null ? null : salary,
  };
}

async function processRow(row: JobRow, template: string): Promise<string | null> {
  const label = `${row.company} - ${row.title}`;
  log(STAGE, `start | ${label}`);
  const prompt = render(template, {
    url: row.url ?? "",
    title: row.title ?? "",
    company: row.company ?? "",
  });
  const llm = await llmJson(STAGE, row.url ?? label, prompt, chatWebsearch);
  if (llm == null) {
    await appendFailureForRow(row as Record<string, unknown>, "01-analyze");
    return null;
  }
  const outPath = path.join(OUT_DIR, rowRelpath(row));
  writeJson(outPath, buildRecord(row, llm));
  log(STAGE, `wrote ${outPath}`);
  return outPath;
}

async function loadRows(argv: string[]): Promise<JobRow[] | null> {
  if (argv[0] === "--rows-jsonl") {
    if (argv.length < 2) {
      log(STAGE, "--rows-jsonl requires a path argument");
      return null;
    }
    const p = repoPath(argv[1]);
    if (!fs.existsSync(p)) {
      log(STAGE, `rows jsonl not found: ${p}`);
      return null;
    }
    return loadRowsJsonl(p);
  }
  const xlsx = argv.length ? repoPath(argv[0]) : JOBS_XLSX_PATH;
  if (!fs.existsSync(xlsx)) {
    log(STAGE, `xlsx not found: ${xlsx}`);
    return null;
  }
  return dedupByUrl(await extractRows(xlsx));
}

export async function runStage(argv: string[] = []): Promise<number> {
  const template = loadPromptOrLog("analyze");
  if (template == null) return 1;
  const rows = await loadRows(argv);
  if (rows == null) return 1;
  if (!rows.length) {
    log(STAGE, "no rows to process");
    return 0;
  }
  const written = await runParallel(STAGE, rows, (row) => processRow(row, template));
  log(STAGE, `done - ${written}/${rows.length} records written to ${OUT_DIR}`);
  return 0;
}
