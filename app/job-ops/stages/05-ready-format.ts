// Create editable PDF-ready CV markdown from risk-control reports.
import fs from "node:fs";
import path from "node:path";
import { chat } from "../lib/codex-client";
import {
  buildReadyRecord,
  parseContact,
  sourceFiles,
} from "../lib/cv-payload";
import { appendFailureForPath } from "../lib/error-log";
import { dumps, jsonFiles, mirroredOutput, readJson, relativeToDir, requireFile } from "../lib/files";
import { llmJson } from "../lib/llm";
import { log } from "../lib/logging";
import { CV_MD_PATH, OUTPUTS_DIR } from "../lib/paths";
import { render } from "../lib/prompt";
import { readyToMarkdown } from "../lib/ready-markdown";
import { loadPromptOrLog, runParallel, safeReadJson } from "../lib/stage-utils";

const STAGE = "ready-format";
const IN_DIR = path.join(OUTPUTS_DIR, "risk-control");
const OUT_DIR = path.join(OUTPUTS_DIR, "ready-format");
const ANALYZE_DIR = path.join(OUTPUTS_DIR, "analyze");
const GOD_CV_DIR = path.join(OUTPUTS_DIR, "god-cv");
const MATCH_CV_DIR = path.join(OUTPUTS_DIR, "match-cv");

function contextFor(filepath: string): {
  analyze: Record<string, unknown> | null;
  godCv: Record<string, unknown> | null;
  matchCv: Record<string, unknown> | null;
  sources: string[];
} {
  const rel = relativeToDir(filepath, IN_DIR);
  const analyzePath = path.join(ANALYZE_DIR, rel);
  const godPath = path.join(GOD_CV_DIR, rel);
  const matchPath = path.join(MATCH_CV_DIR, rel);
  return {
    analyze: readJson(analyzePath, STAGE),
    godCv: readJson(godPath, STAGE),
    matchCv: readJson(matchPath, STAGE),
    sources: sourceFiles(filepath, analyzePath, godPath, matchPath),
  };
}

async function processFile(
  filepath: string,
  template: string,
  masterCv: string,
  masterContact: Record<string, string>,
): Promise<string | null> {
  const resolved = path.resolve(filepath);
  const risk = safeReadJson(resolved, STAGE, IN_DIR, "05-ready-format");
  if (risk == null) return null;
  const { analyze, godCv, matchCv, sources } = contextFor(resolved);
  const source = analyze ?? matchCv ?? godCv ?? {};
  const company = source.company;
  const title = (analyze?.title) ?? (matchCv?.job_title) ?? (godCv?.job_title);
  const label = `${company} - ${title}`;
  log(STAGE, `start | ${label}`);
  const stem = path.basename(resolved, path.extname(resolved));
  const prompt = render(template, {
    master_cv: masterCv,
    contact_json: dumps(masterContact),
    analyzed_job_json: dumps(analyze),
    god_cv_json: dumps(godCv),
    match_cv_json: dumps(matchCv),
    risk_control_json: dumps(risk),
    source_stem: stem,
  });
  const llm = await llmJson(STAGE, path.basename(resolved), prompt, chat);
  if (llm == null) {
    await appendFailureForPath(resolved, IN_DIR, "05-ready-format");
    return null;
  }
  let record: Record<string, unknown>;
  try {
    record = buildReadyRecord(stem, llm, masterContact, risk, analyze, godCv, matchCv, sources);
  } catch (e) {
    log(STAGE, `invalid CV payload for ${path.basename(resolved)} (${(e as Error).message}) - skipping`);
    await appendFailureForPath(resolved, IN_DIR, "05-ready-format");
    return null;
  }
  const outPath = mirroredOutput(resolved, IN_DIR, OUT_DIR).replace(/\.[^.]+$/, ".md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, readyToMarkdown(record), "utf8");
  log(STAGE, `wrote ${outPath}`);
  return outPath;
}

export async function runStage(argv: string[] = []): Promise<number> {
  const masterCv = requireFile(STAGE, CV_MD_PATH, "master CV");
  if (masterCv == null) return 1;
  const files = jsonFiles(argv, IN_DIR, STAGE, "risk-control reports");
  if (!files) return 1;
  if (!files.length) return 0;
  const template = loadPromptOrLog(STAGE);
  if (template == null) return 1;
  const contact = parseContact(masterCv);
  const written = await runParallel(STAGE, files, (p) => processFile(p, template, masterCv, contact));
  log(STAGE, `done - ${written}/${files.length} CV markdown files written to ${OUT_DIR}`);
  return written ? 0 : 1;
}
