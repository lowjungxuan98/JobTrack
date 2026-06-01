// JobOps pipeline runner.
//
// Splits jobs into batches (default 10) and pushes each batch through
// stages 01 → 08 end-to-end before starting the next batch. Stage 09
// (report) is an aggregator that runs once at the very end. Stage 00
// (collect) runs once up-front, unless the `retry` keyword is used.
//
// Usage:
//   npm run job-ops                            # full pipeline, default xlsx
//   npm run job-ops -- path/to/jobs.xlsx       # full pipeline, explicit xlsx
//   npm run job-ops -- retry                   # rebuild xlsx from Failed DB rows
//
// Optional env: RUN_ID=<uuid>  → use a pre-allocated pipeline_runs row.
import fs from "node:fs";
import path from "node:path";
import { chunked, dedupByUrl, rowRelpath, writeRowsJsonl } from "./lib/batch";
import { cfgInt } from "./lib/config";
import { closePool } from "./lib/db-client";
import { JOBS_XLSX_PATH, OUTPUTS_DIR, REPO_ROOT, repoPath } from "./lib/paths";
import { buildRetryXlsxFromDb } from "./lib/retry-xlsx";
import { log } from "./lib/logging";
import {
  createRun,
  finishBatch,
  markRunFailed,
  markRunSuccess,
  setBatchStage,
  setRunCurrentBatch,
  startBatch,
  updateRunTotals,
} from "./lib/run-tracker";
import { extractRows } from "./lib/xlsx-extract";

import { runStage as run00 } from "./stages/00-collect";
import { runStage as run01 } from "./stages/01-analyze";
import { runStage as run02 } from "./stages/02-god-cv";
import { runStage as run03 } from "./stages/03-match-cv";
import { runStage as run04 } from "./stages/04-risk-control";
import { runStage as run05 } from "./stages/05-ready-format";
import { runStage as run06 } from "./stages/06-gen-cv";
import { runStage as run07 } from "./stages/07-cover-letter";
import { runStage as run08 } from "./stages/08-attachment";
import { runStage as run09 } from "./stages/09-report";

const STAGE = "main";
const BATCH_TMP_DIR = path.join(OUTPUTS_DIR, ".batches");

interface StageDef {
  num: number;
  name: string;
  run: (argv: string[]) => Promise<number>;
}

const STAGES: StageDef[] = [
  { num: 0, name: "collect", run: run00 },
  { num: 1, name: "analyze", run: run01 },
  { num: 2, name: "god-cv", run: run02 },
  { num: 3, name: "match-cv", run: run03 },
  { num: 4, name: "risk-control", run: run04 },
  { num: 5, name: "ready-format", run: run05 },
  { num: 6, name: "gen-cv", run: run06 },
  { num: 7, name: "cover-letter", run: run07 },
  { num: 8, name: "attachment", run: run08 },
  { num: 9, name: "report", run: run09 },
];

const STAGE_INPUT: Record<number, { dir: string; suffixes: string[] }> = {
  2: { dir: path.join(OUTPUTS_DIR, "analyze"), suffixes: [".json"] },
  3: { dir: path.join(OUTPUTS_DIR, "god-cv"), suffixes: [".json"] },
  4: { dir: path.join(OUTPUTS_DIR, "match-cv"), suffixes: [".json"] },
  5: { dir: path.join(OUTPUTS_DIR, "risk-control"), suffixes: [".json"] },
  6: { dir: path.join(OUTPUTS_DIR, "ready-format"), suffixes: [".md", ".json"] },
  7: { dir: path.join(OUTPUTS_DIR, "ready-format"), suffixes: [".md", ".json"] },
  8: { dir: path.join(OUTPUTS_DIR, "ready-format"), suffixes: [".md", ".json"] },
};

interface ParsedArgs {
  xlsx?: string;
  retry: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { retry: false };
  for (const a of argv) {
    if (a === "retry") out.retry = true;
    else if (!out.xlsx && !a.startsWith("--")) out.xlsx = a;
  }
  return out;
}

function fmtSecs(s: number): string {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m ? `${m}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
}

async function runWithBanner(label: string, fn: () => Promise<number>): Promise<number> {
  process.stderr.write(`\n=== ${label} ===\n`);
  const t0 = Date.now();
  let code: number;
  try {
    code = await fn();
  } catch (e) {
    log(STAGE, `${label} threw: ${(e as Error).message}`);
    code = 1;
  }
  process.stderr.write(`=== ${label} done in ${fmtSecs((Date.now() - t0) / 1000)} (exit ${code}) ===\n`);
  return code;
}

function batchInputs(num: number, rels: string[]): string[] {
  const cfgEntry = STAGE_INPUT[num];
  if (!cfgEntry) return [];
  const { dir, suffixes } = cfgEntry;
  const out: string[] = [];
  for (const rel of rels) {
    const parent = path.dirname(rel);
    const stem = path.basename(rel, path.extname(rel));
    for (const sfx of suffixes) {
      const p = path.join(dir, parent, `${stem}${sfx}`);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) out.push(p);
    }
  }
  return out;
}

async function runStage(stage: StageDef, rels: string[], batchJsonl: string): Promise<number> {
  const label = `batch stage ${String(stage.num).padStart(2, "0")}-${stage.name}`;
  if (stage.num === 1) {
    return runWithBanner(label, () => stage.run(["--rows-jsonl", batchJsonl]));
  }
  if (!(stage.num in STAGE_INPUT)) {
    return runWithBanner(label, () => stage.run([]));
  }
  const files = batchInputs(stage.num, rels);
  if (!files.length) {
    log(STAGE, `stage ${String(stage.num).padStart(2, "0")}-${stage.name}: no surviving inputs for batch — skipping`);
    return 0;
  }
  return runWithBanner(label, () => stage.run(files));
}

async function runSingle(stage: StageDef, kind: string): Promise<number> {
  const label = `${kind} stage ${String(stage.num).padStart(2, "0")}-${stage.name}`;
  const code = await runWithBanner(label, () => stage.run([]));
  if (code !== 0) log(STAGE, `${kind} stage ${String(stage.num).padStart(2, "0")}-${stage.name} failed (exit ${code})`);
  return code;
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const isRetry = args.retry || args.xlsx === "retry";
  const runId =
    process.env.RUN_ID && process.env.RUN_ID.length > 0
      ? process.env.RUN_ID
      : await createRun(isRetry ? "retry" : "full");

  const pre = isRetry ? undefined : STAGES.find((s) => s.num === 0);
  const perBatch = STAGES.filter((s) => s.num >= 1 && s.num <= 8);
  const final = STAGES.find((s) => s.num === 9);

  if (pre) {
    const code = await runSingle(pre, "pre");
    if (code !== 0) {
      await markRunFailed(runId, `stage 00-collect exit ${code}`);
      return code;
    }
  }

  let xlsx: string;
  if (isRetry) {
    const failed = await buildRetryXlsxFromDb(JOBS_XLSX_PATH);
    if (failed === 0) {
      log(STAGE, "retry: no Failed rows in database - nothing to do");
      await markRunSuccess(runId);
      return 0;
    }
    log(STAGE, `retry: regenerated ${JOBS_XLSX_PATH} with ${failed} failed row(s) from database`);
    xlsx = JOBS_XLSX_PATH;
  } else {
    xlsx = args.xlsx ? repoPath(args.xlsx) : JOBS_XLSX_PATH;
  }
  if (!fs.existsSync(xlsx)) {
    log(STAGE, `xlsx not found: ${xlsx}`);
    await markRunFailed(runId, `xlsx not found: ${xlsx}`);
    return 1;
  }

  const rows = dedupByUrl(await extractRows(xlsx));
  if (!rows.length) {
    log(STAGE, `no rows extracted from ${xlsx}`);
    await updateRunTotals(runId, 0, 0);
    if (final) {
      const code = await runSingle(final, "final");
      if (code !== 0) {
        await markRunFailed(runId, `stage 09-report exit ${code}`);
        return code;
      }
    }
    await markRunSuccess(runId);
    return 0;
  }

  const bsize = Math.max(1, cfgInt("pipeline.batch_size", 10));
  const batches = [...chunked(rows, bsize)];
  await updateRunTotals(runId, rows.length, batches.length);
  const pipelineT0 = Date.now();
  log(STAGE, `${rows.length} rows → ${batches.length} batch(es) of up to ${bsize}`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const startRow = bi * bsize + 1;
    const endRow = startRow + batch.length - 1;
    const pct = Math.floor(((bi + 1) * 100) / batches.length);
    process.stderr.write(
      `\n##### BATCH ${bi + 1}/${batches.length} (${pct}%) | rows ${startRow}-${endRow} | elapsed ${fmtSecs(
        (Date.now() - pipelineT0) / 1000,
      )} #####\n`,
    );
    await setRunCurrentBatch(runId, bi + 1);
    const batchId = await startBatch(runId, bi + 1, startRow, endRow);

    const batchT0 = Date.now();
    const rels = batch.map(rowRelpath);
    const batchJsonl = writeRowsJsonl(
      path.join(BATCH_TMP_DIR, `batch-${String(bi + 1).padStart(4, "0")}.jsonl`),
      batch,
    );

    let batchFailed = false;
    for (const stage of perBatch) {
      const stageLabel = `${String(stage.num).padStart(2, "0")}-${stage.name}`;
      await setBatchStage(batchId, stageLabel);
      const code = await runStage(stage, rels, batchJsonl);
      if (code !== 0) {
        log(STAGE, `batch ${bi + 1}: stage ${stageLabel} failed — skipping rest of batch`);
        await finishBatch(batchId, "failed", `stage ${stageLabel} exit ${code}`);
        batchFailed = true;
        break;
      }
    }
    if (!batchFailed) await finishBatch(batchId, "success");
    log(STAGE, `batch ${bi + 1}/${batches.length} finished in ${fmtSecs((Date.now() - batchT0) / 1000)}`);
  }
  log(STAGE, `all batches done in ${fmtSecs((Date.now() - pipelineT0) / 1000)}`);

  if (final) {
    const code = await runSingle(final, "final");
    if (code !== 0) {
      await markRunFailed(runId, `stage 09-report exit ${code}`);
      return code;
    }
  }
  log(STAGE, "pipeline complete");
  await markRunSuccess(runId);
  return 0;
}

main(process.argv.slice(2))
  .then(async (code) => {
    await closePool();
    process.exit(code);
  })
  .catch(async (e: Error) => {
    log(STAGE, `unhandled: ${e.message}`);
    const runId = process.env.RUN_ID;
    if (runId) await markRunFailed(runId, e.message);
    await closePool();
    process.exit(1);
  });

// Reference REPO_ROOT to keep import tree-shake-safe in case main is imported.
void REPO_ROOT;
