// Render ready-format Markdown/JSON to outputs/cv/html and outputs/cv/pdf.
import fs from "node:fs";
import path from "node:path";
import { renderHtml } from "../lib/cv-html";
import { appendFailureForPath } from "../lib/error-log";
import { relativeToDir, requireFile } from "../lib/files";
import { log } from "../lib/logging";
import { OUTPUTS_DIR, TEMPLATES_DIR } from "../lib/paths";
import { renderPdf } from "../lib/pdf-ops";
import { runReadyStage } from "../lib/ready-stage";
import { loadReadyFile } from "../lib/ready-markdown";
import { logStartFor, metadataOf, paperFormatOf } from "../lib/stage-utils";

const STAGE = "gen-cv";
const IN_DIR = path.join(OUTPUTS_DIR, "ready-format");
const HTML_DIR = path.join(OUTPUTS_DIR, "cv", "html");
const PDF_DIR = path.join(OUTPUTS_DIR, "cv", "pdf");
const TEMPLATE = path.join(TEMPLATES_DIR, "cv-template.html");

async function processFile(filepath: string, template: string): Promise<string | null> {
  const data = loadReadyFile(filepath, STAGE);
  if (data == null) {
    await appendFailureForPath(filepath, IN_DIR, "06-gen-cv");
    return null;
  }
  const metadata = metadataOf(data);
  logStartFor(STAGE, metadata);
  let html: string;
  try {
    html = renderHtml(data, template);
  } catch (e) {
    log(STAGE, `template render failed for ${path.basename(filepath)} (${(e as Error).message}) - skipping`);
    await appendFailureForPath(filepath, IN_DIR, "06-gen-cv");
    return null;
  }
  const paperFormat = paperFormatOf(metadata) as "a4" | "letter";
  const rel = relativeToDir(filepath, IN_DIR);
  const htmlPath = path.join(HTML_DIR, rel).replace(/\.[^.]+$/, ".html");
  const pdfPath = path.join(PDF_DIR, rel).replace(/\.[^.]+$/, ".pdf");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(htmlPath, html, "utf8");
  if (!(await renderPdf(htmlPath, pdfPath, paperFormat))) {
    log(STAGE, `PDF render failed for ${path.basename(filepath)}`);
    await appendFailureForPath(filepath, IN_DIR, "06-gen-cv");
    return null;
  }
  log(STAGE, `wrote ${htmlPath}`);
  log(STAGE, `wrote ${pdfPath}`);
  return pdfPath;
}

export async function runStage(argv: string[] = []): Promise<number> {
  const template = requireFile(STAGE, TEMPLATE, "template");
  if (template == null) return 1;
  return runReadyStage(STAGE, argv, IN_DIR, "ready-format files", PDF_DIR, "PDFs", (p) =>
    processFile(p, template),
  );
}
