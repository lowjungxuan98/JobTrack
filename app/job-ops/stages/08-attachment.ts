// Merge cover letter, CV, onboarding letter, and certs into one attachment.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { appendFailureForPath } from "../lib/error-log";
import { relativeToDir, writeJson } from "../lib/files";
import { extractFirstJson } from "../lib/json-extract";
import { OUTPUTS_DIR, REPO_ROOT, repoPath } from "../lib/paths";
import { mergePdfs } from "../lib/pdf-ops";
import { runReadyStage } from "../lib/ready-stage";
import { loadPrompt } from "../lib/prompt";
import { loadReadyFile } from "../lib/ready-markdown";
import { log } from "../lib/logging";
import { logStartFor, metadataOf } from "../lib/stage-utils";
import { s } from "../lib/values";

const STAGE = "attachment";
const IN_DIR = path.join(OUTPUTS_DIR, "ready-format");
const PDF_DIR = path.join(OUTPUTS_DIR, "attachment", "pdf");
const MANIFEST_DIR = path.join(OUTPUTS_DIR, "attachment", "manifest");

interface Control {
  sequence: Record<string, unknown>[];
}

function loadControl(): Control | null {
  let raw: string;
  try {
    raw = loadPrompt(STAGE);
  } catch (e) {
    log(STAGE, (e as Error).message);
    return null;
  }
  const control = extractFirstJson(raw);
  if (
    !control ||
    typeof control !== "object" ||
    Array.isArray(control) ||
    !Array.isArray((control as Record<string, unknown>).sequence)
  ) {
    log(STAGE, "attachment prompt must contain a JSON object with a sequence array");
    return null;
  }
  return control as Control;
}

async function pageCount(filepath: string): Promise<number> {
  const bytes = fs.readFileSync(filepath);
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPageCount();
}

function contextFor(rel: string): Record<string, string> {
  const relPdf = rel.replace(/\.[^.]+$/, ".pdf");
  const dir = path.dirname(rel);
  const stem = path.basename(rel, path.extname(rel));
  return {
    relative_json: rel.split(path.sep).join("/"),
    relative_pdf: relPdf.split(path.sep).join("/"),
    sheet: dir === "." ? "" : dir.split(path.sep).join("/"),
    job: stem,
  };
}

function substitute(template: string, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => context[key] ?? "");
}

function expandGlob(pattern: string): string[] {
  // Minimal sync glob via fs walk to mirror Python's glob.glob.
  const matches: string[] = [];
  const normalized = path.normalize(pattern);
  const absolute = path.isAbsolute(normalized);
  const segments = normalized.split(/[\\/]/);
  const start = absolute ? path.parse(normalized).root : "";
  const startIdx = absolute ? 1 : 0;
  const walk = (idx: number, current: string) => {
    if (idx >= segments.length) {
      if (fs.existsSync(current) && fs.statSync(current).isFile()) matches.push(current);
      return;
    }
    const seg = segments[idx];
    if (seg.includes("*") || seg.includes("?")) {
      if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return;
      const re = new RegExp(
        "^" + seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
      );
      for (const entry of fs.readdirSync(current)) {
        if (re.test(entry)) walk(idx + 1, path.join(current, entry));
      }
    } else {
      walk(idx + 1, current ? path.join(current, seg) : seg);
    }
  };
  walk(startIdx, start);
  return matches;
}

function resolveItem(
  item: Record<string, unknown>,
  context: Record<string, string>,
): { sources: string[]; missing: string[] } {
  const sources: string[] = [];
  const missing: string[] = [];
  const rawSources: string[] = [];
  if (item.source) rawSources.push(substitute(s(item.source), context));
  let extra = item.sources ?? [];
  if (typeof extra === "string") extra = [extra];
  if (Array.isArray(extra)) {
    for (const src of extra) {
      const text = s(src);
      if (text) rawSources.push(substitute(text, context));
    }
  }
  for (const raw of rawSources) {
    const p = path.resolve(repoPath(raw));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) sources.push(p);
    else missing.push(raw);
  }
  if (item.glob) {
    const pattern = path.resolve(repoPath(substitute(s(item.glob), context)));
    const matches = expandGlob(pattern);
    if (s(item.sort) === "name") matches.sort((a, b) => path.basename(a).toLowerCase().localeCompare(path.basename(b).toLowerCase()));
    sources.push(...matches);
    if (!matches.length) missing.push(pattern);
  }
  return { sources, missing };
}

async function buildSources(control: Control, rel: string): Promise<{
  entries: Record<string, unknown>[];
  missingRequired: string[];
}> {
  const context = contextFor(rel);
  const entries: Record<string, unknown>[] = [];
  const missingRequired: string[] = [];
  for (const item of control.sequence) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const { sources, missing } = resolveItem(item, context);
    const required = Boolean(item.required);
    if (required) missingRequired.push(...missing);
    for (const source of sources) {
      entries.push({
        id: s(item.id),
        label: s(item.label) || s(item.id),
        path: path.relative(REPO_ROOT, source),
        pages: await pageCount(source),
        required,
      });
    }
  }
  return { entries, missingRequired };
}

async function processFile(filepath: string, control: Control): Promise<string | null> {
  const ready = loadReadyFile(filepath, STAGE);
  if (ready == null) {
    await appendFailureForPath(filepath, IN_DIR, "08-attachment");
    return null;
  }
  const rel = relativeToDir(filepath, IN_DIR);
  const metadata = metadataOf(ready);
  logStartFor(STAGE, metadata);
  const { entries, missingRequired } = await buildSources(control, rel);
  const manifestPath = path.join(MANIFEST_DIR, rel).replace(/\.[^.]+$/, ".json");
  const outputPath = path.join(PDF_DIR, rel).replace(/\.[^.]+$/, ".pdf");
  const manifest: Record<string, unknown> = {
    metadata,
    control_prompt: "app/job-ops/prompts/attachment.txt",
    output: path.relative(REPO_ROOT, outputPath),
    sources: entries,
    missing_required: missingRequired,
  };
  if (missingRequired.length) {
    writeJson(manifestPath, manifest);
    log(STAGE, `missing required sources for ${rel}: ${missingRequired.join(", ")}`);
    await appendFailureForPath(filepath, IN_DIR, "08-attachment");
    return null;
  }
  await mergePdfs(
    entries.map((e) => path.join(REPO_ROOT, String(e.path))),
    outputPath,
  );
  manifest.pages = await pageCount(outputPath);
  writeJson(manifestPath, manifest);
  log(STAGE, `wrote ${manifestPath}`);
  log(STAGE, `wrote ${outputPath}`);
  return outputPath;
}

export async function runStage(argv: string[] = []): Promise<number> {
  const control = loadControl();
  if (control == null) return 1;
  return runReadyStage(STAGE, argv, IN_DIR, "ready-format files", PDF_DIR, "attachments", (p) =>
    processFile(p, control),
  );
}
