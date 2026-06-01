// Collect job postings across (platform × role) pairs via codex,
// dedupe within and across platforms, cap each role, and write the
// deduped workbook for stage 01-analyze.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { chatWebsearch } from "../lib/codex-client";
import { CONFIG } from "../lib/config";
import { fetchKnownUrls } from "../lib/db-client";
import { llmJsonArray } from "../lib/llm";
import { log } from "../lib/logging";
import { JOBS_XLSX_PATH, OUTPUTS_DIR } from "../lib/paths";
import { loadPrompt, render } from "../lib/prompt";
import { runParallel } from "../lib/stage-utils";

const STAGE = "collect";
const OUT_DIR = path.join(OUTPUTS_DIR, "collect");

const SHEETS = ["mobile", "devops", "software_engineer", "full_stack", "backend", "frontend"];
const SCRATCH_COLUMNS = [
  "job_title", "company", "location", "posted", "posted_date",
  "job_id", "matched_search_terms", "url",
];
const OUTPUT_COLUMNS = [...SCRATCH_COLUMNS, "source_platforms", "duplicate_count"];

const PLATFORM_DOMAINS: Record<string, string> = {
  linkedin: "linkedin.com",
  jobstreet: "jobstreet.com",
  indeed: "indeed.com",
  glassdoor: "glassdoor.com",
};

function bulletList(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

function commaList(items: string[]): string {
  return items.join(", ");
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildPrompt(
  template: string,
  platform: string,
  role: string,
  roleCfg: Record<string, unknown>,
  eligibility: Record<string, unknown>,
  target: number,
): string {
  const days = Number(eligibility.posted_within_days ?? 7);
  return render(template, {
    platform,
    platform_domain: PLATFORM_DOMAINS[platform] ?? platform,
    role,
    today: isoToday(),
    cutoff_date: isoMinus(days),
    posted_within_days: String(days),
    target,
    search_terms: bulletList((roleCfg.search_terms as string[]) ?? []),
    relevance_keywords: bulletList((roleCfg.relevance_keywords as string[]) ?? []),
    exclude_keywords: commaList((eligibility.exclude_keywords as string[]) ?? []),
  });
}

async function collectPair(
  platform: string,
  role: string,
  template: string,
  roleCfg: Record<string, unknown>,
  eligibility: Record<string, unknown>,
  target: number,
): Promise<string | null> {
  const label = `${platform}/${role}`;
  log(STAGE, `start | ${label}`);
  const prompt = buildPrompt(template, platform, role, roleCfg, eligibility, target);
  const rows = await llmJsonArray(STAGE, label, prompt, chatWebsearch);
  if (rows == null) return null;
  const outPath = path.join(OUT_DIR, platform, `${role}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n", "utf8");
  log(STAGE, `wrote ${outPath} (${rows.length} rows)`);
  return outPath;
}

function parseDate(value: unknown): number {
  if (!value) return -Infinity;
  const str = String(value).slice(0, 10);
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : -Infinity;
}

const DAY_MS = 86400000;

// Convert a relative posted phrase ("3 days ago", "2 weeks ago", "yesterday", ...)
// to an absolute date in ms. Returns null if the phrase is unparseable so the caller
// can fall back to the LLM-supplied posted_date.
function relativeToMs(posted: unknown, todayMs: number): number | null {
  if (posted == null) return null;
  const s = String(posted).trim().toLowerCase();
  if (!s) return null;
  if (s === "yesterday") return todayMs - DAY_MS;
  if (
    s === "today" ||
    s === "just now" ||
    s.startsWith("moment") ||
    /^\d+\s*(minute|hour)s?\s*ago$/.test(s)
  ) return todayMs;
  const m = s.match(/^(\d+)\s*(day|week|month|year)s?\s*ago$/);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case "day":   return todayMs - n * DAY_MS;
    case "week":  return todayMs - n * 7 * DAY_MS;
    case "month": return todayMs - n * 30 * DAY_MS;  // approximate
    case "year":  return todayMs - n * 365 * DAY_MS; // approximate
    default:      return null;
  }
}

// LLMs reliably copy LinkedIn's "X weeks ago" off the page but unreliably compute
// the matching ISO date — they often stamp today's date. Trust the relative phrase
// over the computed posted_date whenever the two disagree by more than a day.
function reconcilePostedDates(
  rows: Record<string, unknown>[],
  todayMs: number,
  label: string,
): Record<string, unknown>[] {
  let fixed = 0;
  for (const r of rows) {
    const relMs = relativeToMs(r.posted, todayMs);
    if (relMs == null) continue;
    const recordedMs = parseDate(r.posted_date);
    if (recordedMs === -Infinity || Math.abs(recordedMs - relMs) > DAY_MS) {
      r.posted_date = new Date(relMs).toISOString().slice(0, 10);
      fixed++;
    }
  }
  if (fixed) log(STAGE, `${label}: reconciled posted_date for ${fixed} row(s) from 'posted' phrase`);
  return rows;
}

function dedupeWithinPlatform(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  for (const r of rows) {
    const key = (String(r.job_id ?? "").trim() || String(r.url ?? "").trim()).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  return unique;
}

function filterEligible(
  rows: Record<string, unknown>[],
  excludeKeywords: string[],
  cutoffMs: number,
  todayMs: number,
): Record<string, unknown>[] {
  const excl = excludeKeywords.map((k) => k.toLowerCase());
  return rows.filter((r) => {
    const title = String(r.job_title ?? "").toLowerCase();
    if (excl.some((k) => title.includes(k))) return false;
    const d = parseDate(r.posted_date);
    if (d === -Infinity) return false;
    return d >= cutoffMs && d <= todayMs;
  });
}

const NORM_SUFFIX_RE = /\b(pte|private|limited|ltd|inc|corp|corporation|llc|plc)\b\.?/g;
const NORM_PUNCT_RE = /[,.\(\)\[\]\{\}]/g;

function normalize(value: unknown): string {
  if (!value) return "";
  let s = String(value).toLowerCase().trim();
  s = s.replace(NORM_SUFFIX_RE, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(NORM_PUNCT_RE, "");
  return s;
}

function crossPlatformDedupe(
  rowsByPlatform: Record<string, Record<string, unknown>[]>,
): Record<string, unknown>[] {
  const tagged: Record<string, unknown>[] = [];
  for (const [platform, rows] of Object.entries(rowsByPlatform)) {
    for (const r of rows) tagged.push({ ...r, _platform: platform });
  }
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of tagged) {
    const key = JSON.stringify([
      normalize(r.job_title),
      normalize(r.company),
      normalize(r.location),
    ]);
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const merged: Record<string, unknown>[] = [];
  for (const group of groups.values()) {
    const platformsSeen = [...new Set(group.map((r) => String(r._platform)))].sort();
    if (platformsSeen.length >= 2) {
      const best = group.reduce((a, b) =>
        String(a.posted_date ?? "") >= String(b.posted_date ?? "") ? a : b,
      );
      const row: Record<string, unknown> = {};
      for (const c of SCRATCH_COLUMNS) row[c] = best[c] ?? "";
      row.source_platforms = platformsSeen.join(", ");
      row.duplicate_count = platformsSeen.length;
      merged.push(row);
    } else {
      for (const r of group) {
        const row: Record<string, unknown> = {};
        for (const c of SCRATCH_COLUMNS) row[c] = r[c] ?? "";
        row.source_platforms = platformsSeen[0];
        row.duplicate_count = 1;
        merged.push(row);
      }
    }
  }
  return merged;
}

async function writeXlsx(
  rowsPerSheet: Record<string, Record<string, unknown>[]>,
  filepath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const wb = new ExcelJS.Workbook();
  for (const sheet of SHEETS) {
    const ws = wb.addWorksheet(sheet);
    ws.addRow([...OUTPUT_COLUMNS]);
    for (const r of rowsPerSheet[sheet] ?? []) {
      ws.addRow(OUTPUT_COLUMNS.map((c) => r[c] ?? ""));
    }
  }
  await wb.xlsx.writeFile(filepath);
}

export async function runStage(): Promise<number> {
  const collectCfg = (CONFIG.collect as Record<string, unknown>) ?? {};
  if (!Object.keys(collectCfg).length) {
    log(STAGE, "no 'collect' section in config.yaml");
    return 1;
  }
  let template: string;
  try {
    template = loadPrompt("collect");
  } catch (e) {
    log(STAGE, (e as Error).message);
    return 1;
  }
  const eligibility = (collectCfg.eligibility as Record<string, unknown>) ?? {};
  const platforms = Object.keys((collectCfg.platforms as Record<string, unknown>) ?? {});
  const rolesCfg = (collectCfg.roles as Record<string, Record<string, unknown>>) ?? {};
  const target = Math.max(1, Number(collectCfg.target_per_role ?? 20) | 0);
  if (!platforms.length) {
    log(STAGE, "no platforms configured");
    return 1;
  }
  const pairs = platforms.flatMap((p) => SHEETS.filter((r) => r in rolesCfg).map((r) => [p, r] as const));
  if (!pairs.length) {
    log(STAGE, "no (platform, role) pairs to collect");
    return 1;
  }
  log(STAGE, `${pairs.length} (platform, role) pairs; target ${target}/role`);
  await runParallel(STAGE, [...pairs], async ([platform, role]) =>
    collectPair(platform, role, template, rolesCfg[role], eligibility, target),
  );

  const todayMs = Date.parse(isoToday());
  const cutoffMs = Date.parse(isoMinus(Number(eligibility.posted_within_days ?? 7)));
  const excludeKeywords = ((eligibility.exclude_keywords as string[]) ?? []).slice();
  const reported = await fetchKnownUrls();
  if (reported.size) log(STAGE, `loaded ${reported.size} known URLs from db for dedup`);

  const rowsPerSheet: Record<string, Record<string, unknown>[]> = {};
  for (const sheet of SHEETS) rowsPerSheet[sheet] = [];
  for (const sheet of SHEETS) {
    const rowsByPlatform: Record<string, Record<string, unknown>[]> = {};
    for (const platform of platforms) {
      const p = path.join(OUT_DIR, platform, `${sheet}.json`);
      if (!fs.existsSync(p)) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (e) {
        log(STAGE, `cannot read ${p} (${(e as Error).message}) - skipping`);
        continue;
      }
      if (!Array.isArray(raw)) continue;
      let rows = raw.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
      rows = reconcilePostedDates(rows, todayMs, `${platform}/${sheet}`);
      rows = filterEligible(rows, excludeKeywords, cutoffMs, todayMs);
      rows = dedupeWithinPlatform(rows);
      if (rows.length) rowsByPlatform[platform] = rows;
    }
    let merged = crossPlatformDedupe(rowsByPlatform);
    if (reported.size) {
      const before = merged.length;
      merged = merged.filter((r) => !reported.has(String(r.url ?? "").trim()));
      if (before !== merged.length) {
        log(STAGE, `${sheet}: dropped ${before - merged.length} already-reported URL(s)`);
      }
    }
    merged.sort((a, b) => parseDate(b.posted_date) - parseDate(a.posted_date));
    rowsPerSheet[sheet] = merged.slice(0, target);
    const inCount = Object.values(rowsByPlatform).reduce((s, v) => s + v.length, 0);
    log(STAGE, `${sheet}: ${inCount} in -> ${rowsPerSheet[sheet].length} out (cap ${target})`);
  }
  await writeXlsx(rowsPerSheet, JOBS_XLSX_PATH);
  const total = Object.values(rowsPerSheet).reduce((s, v) => s + v.length, 0);
  log(STAGE, `done - wrote ${total} rows across ${SHEETS.length} sheets to ${JOBS_XLSX_PATH}`);
  return total ? 0 : 1;
}
