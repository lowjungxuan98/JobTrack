import path from "node:path";
import { fileURLToPath } from "node:url";

export const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, "..");
export const ASSETS_DIR = path.join(REPO_ROOT, "assets");
export const PROMPTS_DIR = path.join(REPO_ROOT, "prompts");
export const OUTPUTS_DIR = path.join(REPO_ROOT, "outputs");
export const TEMPLATES_DIR = path.join(ASSETS_DIR, "templates");
export const FONTS_DIR = path.join(ASSETS_DIR, "fonts");
export const LETTER_DIR = path.join(ASSETS_DIR, "letter");
export const CV_MD_PATH = path.join(ASSETS_DIR, "cv.md");
export const JOBS_XLSX_PATH = path.join(ASSETS_DIR, "jobs", "jobs.xlsx");
export const REPORT_XLSX_PATH = path.join(OUTPUTS_DIR, "report.xlsx");
export const CONFIG_PATH = path.join(REPO_ROOT, "config.yaml");

export function repoPath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}
