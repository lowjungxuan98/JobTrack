// Normalize ready-format CV payloads.
import fs from "node:fs";
import path from "node:path";
import {
  RISKS,
  dictList,
  firstStr,
  recordOf,
  safeChoice,
  s,
  strList,
} from "./values";
import { REPO_ROOT } from "./paths";

export const PAPER_FORMATS = new Set(["a4", "letter"]);
export const MIN_EXPERIENCE_BULLETS = 5;

export function displayUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function labeledValue(text: string, label: string): string {
  const pattern = new RegExp(
    `^\\s*(?:\\*\\*)?${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`,
    "im",
  );
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
}

export function parseContact(masterCv: string): Record<string, string> {
  let name = "";
  let headline = "";
  for (const line of masterCv.split(/\r?\n/)) {
    const stripped = line.trim();
    if (!stripped) continue;
    if (stripped.startsWith("#")) {
      name = stripped.replace(/^#+/, "").trim();
    } else if (name && !headline && !stripped.includes(":") && !stripped.startsWith("-")) {
      headline = stripped.replace(/^[* ]+|[* ]+$/g, "");
      break;
    }
  }
  let email = labeledValue(masterCv, "Email");
  if (!email) {
    const m = masterCv.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    email = m ? m[0] : "";
  }
  const linkedin = labeledValue(masterCv, "LinkedIn");
  const portfolio = labeledValue(masterCv, "Portfolio");
  return {
    name,
    headline,
    email,
    phone: labeledValue(masterCv, "Phone"),
    linkedin_url: linkedin,
    linkedin_display: displayUrl(linkedin),
    portfolio_url: portfolio,
    portfolio_display: displayUrl(portfolio),
    location: labeledValue(masterCv, "Location"),
  };
}

export function inferPaperFormat(location: string): "a4" | "letter" {
  const padded = ` ${location.toLowerCase()} `;
  const tokens = [
    "united states", "usa", "u.s.", " us ", "canada", "toronto",
    "vancouver", "montreal", "new york", "san francisco", "seattle",
    "austin", "boston", "california",
  ];
  return tokens.some((t) => padded.includes(t)) ? "letter" : "a4";
}

function metadataBlock(
  stem: string,
  llm: Record<string, unknown>,
  analyze: Record<string, unknown> | null,
  godCv: Record<string, unknown> | null,
  matchCv: Record<string, unknown> | null,
): Record<string, string> {
  const llmMeta = recordOf(llm.metadata);
  const location = s(llmMeta.job_location) || s(analyze?.location);
  const paperFormat = s(llmMeta.paper_format).toLowerCase();
  return {
    job_key: stem,
    company:
      s(llmMeta.company) ||
      s(analyze?.company) ||
      s(matchCv?.company) ||
      s(godCv?.company) ||
      stem,
    job_title:
      s(llmMeta.job_title) ||
      s(analyze?.title) ||
      s(matchCv?.job_title) ||
      s(godCv?.job_title) ||
      stem,
    job_url: s(llmMeta.job_url) || s(analyze?.job_url),
    job_location: location,
    language: "en",
    paper_format: PAPER_FORMATS.has(paperFormat) ? paperFormat : inferPaperFormat(location),
  };
}

function contactBlock(
  llm: Record<string, unknown>,
  fallback: Record<string, string>,
): Record<string, string> {
  const source = recordOf(llm.contact);
  const keys = [
    "name",
    "headline",
    "email",
    "phone",
    "linkedin_url",
    "linkedin_display",
    "portfolio_url",
    "portfolio_display",
    "location",
  ];
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = s(source[k]) || fallback[k] || "";
  out.linkedin_display = out.linkedin_display || displayUrl(out.linkedin_url);
  out.portfolio_display = out.portfolio_display || displayUrl(out.portfolio_url);
  return out;
}

function experienceBlock(value: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const item of dictList(value)) {
    const bullets = strList(item.bullets);
    if (!(s(item.company) || s(item.role) || bullets.length)) continue;
    out.push({
      company: s(item.company),
      role: s(item.role),
      location: s(item.location),
      period: s(item.period),
      bullets,
    });
  }
  return out;
}

function projectsBlock(value: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const item of dictList(value)) {
    const bullets = strList(item.bullets);
    if (!(firstStr(item, "name", "title") || s(item.description) || bullets.length)) continue;
    out.push({
      name: firstStr(item, "name", "title"),
      badge: s(item.badge),
      description: s(item.description),
      tech: firstStr(item, "tech", "technologies"),
      bullets,
    });
  }
  return out;
}

function educationBlock(value: unknown): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const item of dictList(value)) {
    if (
      !(firstStr(item, "degree", "title") || firstStr(item, "school", "institution", "org"))
    )
      continue;
    out.push({
      degree: firstStr(item, "degree", "title"),
      school: firstStr(item, "school", "institution", "org"),
      period: firstStr(item, "period", "year"),
      details: firstStr(item, "details", "description"),
    });
  }
  return out;
}

function certificationsBlock(value: unknown): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const item of dictList(value)) {
    if (!(firstStr(item, "name", "title") || firstStr(item, "issuer", "org"))) continue;
    out.push({
      name: firstStr(item, "name", "title"),
      issuer: firstStr(item, "issuer", "org"),
      year: firstStr(item, "year", "issued"),
    });
  }
  return out;
}

function skillsBlock(value: unknown): Record<string, unknown>[] {
  let iterable: unknown = value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    iterable = Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
      category: key,
      items: val,
    }));
  }
  const out: Record<string, unknown>[] = [];
  for (const item of dictList(iterable)) {
    const category = firstStr(item, "category", "name");
    const items = strList(item.items ?? item.skills);
    if (category && items.length) out.push({ category, items });
  }
  return out;
}

function sectionsBlock(llm: Record<string, unknown>): Record<string, unknown> {
  const sections = recordOf(llm.sections);
  return {
    summary: s(sections.summary),
    competencies: strList(sections.competencies),
    experience: experienceBlock(sections.experience),
    projects: projectsBlock(sections.projects),
    education: educationBlock(sections.education),
    certifications: certificationsBlock(sections.certifications),
    skills: skillsBlock(sections.skills),
  };
}

function coverageBlock(llm: Record<string, unknown>): Record<string, unknown> {
  const coverage = recordOf(llm.coverage);
  const keywords = strList(coverage.keywords);
  const used = strList(coverage.used_keywords);
  let percent = Number(coverage.coverage_percent);
  if (!Number.isFinite(percent)) {
    percent = keywords.length
      ? Math.round((new Set(used).size / new Set(keywords).size) * 100)
      : 0;
  }
  return {
    keywords,
    used_keywords: used,
    coverage_percent: Math.max(0, Math.min(100, Math.trunc(percent))),
  };
}

export function sourceFiles(...paths: string[]): string[] {
  return paths
    .filter((p) => {
      try {
        return fs.existsSync(p) && fs.statSync(p).isFile();
      } catch {
        return false;
      }
    })
    .map((p) => path.relative(REPO_ROOT, p));
}

export function buildReadyRecord(
  stem: string,
  llm: Record<string, unknown>,
  masterContact: Record<string, string>,
  risk: Record<string, unknown>,
  analyze: Record<string, unknown> | null,
  godCv: Record<string, unknown> | null,
  matchCv: Record<string, unknown> | null,
  sources: string[],
): Record<string, unknown> {
  const sections = sectionsBlock(llm);
  if (!s((sections as Record<string, unknown>).summary)) {
    throw new Error("missing sections.summary");
  }
  const experience = (sections as { experience: Record<string, unknown>[] }).experience;
  if (!experience.length) throw new Error("missing sections.experience");
  const thinRoles = experience
    .filter((item) => strList(item.bullets).length < MIN_EXPERIENCE_BULLETS)
    .map((item) => s(item.company) || s(item.role) || "unknown role");
  if (thinRoles.length) {
    throw new Error(
      `experience entries need at least ${MIN_EXPERIENCE_BULLETS} bullets: ${thinRoles.join(", ")}`,
    );
  }
  return {
    metadata: metadataBlock(stem, llm, analyze, godCv, matchCv),
    contact: contactBlock(llm, masterContact),
    sections,
    coverage: coverageBlock(llm),
    guardrails: {
      risk_level: safeChoice(
        risk.risk_level,
        RISKS,
        safeChoice(matchCv?.risk, RISKS, "medium"),
      ),
      do_not_claim: strList(risk.do_not_claim),
      source_files: sources,
    },
  };
}
