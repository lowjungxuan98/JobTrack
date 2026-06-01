// Generate cover-letter JSON, HTML, and PDF from ready-format CV payloads.
import fs from "node:fs";
import path from "node:path";
import { chat } from "../lib/codex-client";
import { normalizeLetter, renderCoverLetter } from "../lib/cover-letter-html";
import { appendFailureForPath } from "../lib/error-log";
import { dumps, relativeToDir, requireFile, writeJson } from "../lib/files";
import { llmJson } from "../lib/llm";
import { log } from "../lib/logging";
import { OUTPUTS_DIR, TEMPLATES_DIR } from "../lib/paths";
import { renderPdf } from "../lib/pdf-ops";
import { render } from "../lib/prompt";
import { runReadyStage } from "../lib/ready-stage";
import { loadReadyFile } from "../lib/ready-markdown";
import { loadPromptOrLog, logStartFor, metadataOf, paperFormatOf } from "../lib/stage-utils";

const STAGE = "cover-letter";
const IN_DIR = path.join(OUTPUTS_DIR, "ready-format");
const JSON_DIR = path.join(OUTPUTS_DIR, "cover-letter", "json");
const HTML_DIR = path.join(OUTPUTS_DIR, "cover-letter", "html");
const PDF_DIR = path.join(OUTPUTS_DIR, "cover-letter", "pdf");
const TEMPLATE = path.join(TEMPLATES_DIR, "cover-letter-template.html");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayLabel(): string {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

async function processFile(
  filepath: string,
  promptTemplate: string,
  htmlTemplate: string,
): Promise<string | null> {
  const ready = loadReadyFile(filepath, STAGE);
  if (ready == null) {
    await appendFailureForPath(filepath, IN_DIR, "07-cover-letter");
    return null;
  }
  logStartFor(STAGE, metadataOf(ready));
  const llm = await llmJson(
    STAGE,
    path.basename(filepath),
    render(promptTemplate, { ready_format_json: dumps(ready) }),
    chat,
  );
  if (llm == null) {
    await appendFailureForPath(filepath, IN_DIR, "07-cover-letter");
    return null;
  }
  const rel = relativeToDir(filepath, IN_DIR);
  const record = normalizeLetter(ready, llm, todayLabel());
  const jsonPath = path.join(JSON_DIR, rel).replace(/\.[^.]+$/, ".json");
  const htmlPath = path.join(HTML_DIR, rel).replace(/\.[^.]+$/, ".html");
  const pdfPath = path.join(PDF_DIR, rel).replace(/\.[^.]+$/, ".pdf");
  writeJson(jsonPath, record);
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, renderCoverLetter(record, htmlTemplate), "utf8");
  const paperFormat = paperFormatOf((record.metadata as Record<string, unknown>) || {}) as "a4" | "letter";
  if (!(await renderPdf(htmlPath, pdfPath, paperFormat))) {
    log(STAGE, `PDF render failed for ${path.basename(filepath)}`);
    await appendFailureForPath(filepath, IN_DIR, "07-cover-letter");
    return null;
  }
  log(STAGE, `wrote ${jsonPath}`);
  log(STAGE, `wrote ${htmlPath}`);
  log(STAGE, `wrote ${pdfPath}`);
  return pdfPath;
}

export async function runStage(argv: string[] = []): Promise<number> {
  const htmlTemplate = requireFile(STAGE, TEMPLATE, "template");
  if (htmlTemplate == null) return 1;
  const promptTemplate = loadPromptOrLog(STAGE);
  if (promptTemplate == null) return 1;
  return runReadyStage(STAGE, argv, IN_DIR, "ready-format files", PDF_DIR, "cover letters", (p) =>
    processFile(p, promptTemplate, htmlTemplate),
  );
}
