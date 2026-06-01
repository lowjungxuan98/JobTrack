// Serialize and parse ready-format CV payloads as editable Markdown.
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./files";
import {
  afterHeading,
  bullet,
  field,
  freeText,
  parseFields,
  parseSections,
  parseSubsections,
  plainBullets,
  stripMd,
} from "./markdown-sections";
import { dictList, recordOf, s, strList } from "./values";

const HIGHLIGHT_MIN_LEN = 3;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightText(value: unknown, terms: string[]): string {
  const text = s(value);
  if (!text) return "";
  let segments: string[] = text.split(/(\*\*.*?\*\*)/g);
  const cleanTerms = Array.from(new Set(terms.filter((t) => t.length >= HIGHLIGHT_MIN_LEN)))
    .sort((a, b) => b.length - a.length);
  for (const term of cleanTerms) {
    const pattern = new RegExp(`(?<![\\w*])(${escapeRegex(term)})(?![\\w*])`, "i");
    const next: string[] = [];
    for (const seg of segments) {
      if (seg.startsWith("**") && seg.endsWith("**")) {
        next.push(seg);
      } else {
        const replaced = seg.replace(pattern, "**$1**");
        next.push(...replaced.split(/(\*\*.*?\*\*)/g));
      }
    }
    segments = next;
  }
  return segments.join("");
}

function highlightRecord(record: Record<string, unknown>): Record<string, unknown> {
  const coverage = recordOf(record.coverage);
  const terms = strList(coverage.used_keywords).length
    ? strList(coverage.used_keywords)
    : strList(coverage.keywords);
  const data = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  const sections = recordOf(data.sections);
  data.sections = sections;
  sections.summary = highlightText(sections.summary, terms);
  sections.competencies = strList(sections.competencies).map((c) => highlightText(c, terms));
  for (const item of dictList(sections.experience)) {
    item.bullets = strList(item.bullets).map((b) => highlightText(b, terms));
  }
  for (const item of dictList(sections.projects)) {
    item.description = highlightText(item.description, terms);
    item.bullets = strList(item.bullets).map((b) => highlightText(b, terms));
  }
  return data;
}

export function readyToMarkdown(record: Record<string, unknown>): string {
  const data = highlightRecord(record);
  const metadata = recordOf(data.metadata);
  const contact = recordOf(data.contact);
  const sections = recordOf(data.sections);
  const coverage = recordOf(data.coverage);
  const guardrails = recordOf(data.guardrails);

  const lines: string[] = [
    `# ${s(contact.name) || "Candidate"} - Tailored CV`,
    "",
    "<!-- jobops-ready-format: v1 -->",
    "",
    "## Metadata",
  ];
  for (const key of ["job_key", "company", "job_title", "job_url", "job_location", "language", "paper_format"]) {
    lines.push(field(key, metadata[key]));
  }
  lines.push("", "## Contact");
  for (const key of [
    "name", "headline", "email", "phone", "linkedin_url", "linkedin_display",
    "portfolio_url", "portfolio_display", "location",
  ]) {
    lines.push(field(key, contact[key]));
  }
  lines.push("", "## Professional Summary", "", s(sections.summary), "", "## Core Competencies");
  for (const item of strList(sections.competencies)) lines.push(bullet(item));
  lines.push("", "## Work Experience");
  for (const item of dictList(sections.experience)) {
    lines.push(
      "",
      `### ${s(item.company)}`,
      field("Role", item.role),
      field("Location", item.location),
      field("Period", item.period),
      "",
      "#### Bullets",
    );
    for (const b of strList(item.bullets)) lines.push(bullet(b));
  }
  lines.push("", "## Projects");
  for (const item of dictList(sections.projects)) {
    lines.push("", `### ${s(item.name)}`, field("Badge", item.badge), field("Tech", item.tech));
    if (s(item.description)) lines.push("", s(item.description));
    lines.push("", "#### Bullets");
    for (const b of strList(item.bullets)) lines.push(bullet(b));
  }
  lines.push("", "## Education");
  for (const item of dictList(sections.education)) {
    lines.push("", `### ${s(item.degree)}`, field("School", item.school), field("Period", item.period));
    if (s(item.details)) lines.push("", s(item.details));
  }
  lines.push("", "## Certifications");
  for (const item of dictList(sections.certifications)) {
    lines.push(`- **${s(item.name)}** | ${s(item.issuer)} | ${s(item.year)}`);
  }
  lines.push("", "## Skills");
  for (const item of dictList(sections.skills)) {
    lines.push("", `### ${s(item.category)}`);
    for (const skill of strList(item.items)) lines.push(bullet(skill));
  }
  lines.push("", "## Coverage", field("coverage_percent", coverage.coverage_percent), "", "### Keywords");
  for (const kw of strList(coverage.keywords)) lines.push(bullet(`\`${kw}\``));
  lines.push("", "### Used Keywords");
  for (const kw of strList(coverage.used_keywords)) lines.push(bullet(`\`${kw}\``));
  lines.push("", "## Guardrails", field("risk_level", guardrails.risk_level), "", "### Do Not Claim");
  for (const item of strList(guardrails.do_not_claim)) lines.push(bullet(item));
  lines.push("", "### Source Files");
  for (const item of strList(guardrails.source_files)) lines.push(bullet(item));
  return lines.join("\n").replace(/\s+$/, "") + "\n";
}

export function readyFromMarkdown(text: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/);
  const sections = parseSections(lines);
  const metadata = parseFields(sections["Metadata"] ?? []);
  const contact = parseFields(sections["Contact"] ?? []);

  const experience: Record<string, unknown>[] = [];
  for (const [company, body] of parseSubsections(sections["Work Experience"] ?? [])) {
    const f = parseFields(body);
    experience.push({
      company: stripMd(company),
      role: f.role ?? "",
      location: f.location ?? "",
      period: f.period ?? "",
      bullets: plainBullets(afterHeading(body, "#### Bullets")),
    });
  }

  const projects: Record<string, unknown>[] = [];
  for (const [name, body] of parseSubsections(sections["Projects"] ?? [])) {
    const f = parseFields(body);
    projects.push({
      name: stripMd(name),
      badge: f.badge ?? "",
      description: freeText(body),
      tech: f.tech ?? "",
      bullets: plainBullets(afterHeading(body, "#### Bullets")),
    });
  }

  const education: Record<string, unknown>[] = [];
  for (const [degree, body] of parseSubsections(sections["Education"] ?? [])) {
    const f = parseFields(body);
    education.push({
      degree: stripMd(degree),
      school: f.school ?? "",
      period: f.period ?? "",
      details: freeText(body),
    });
  }

  const certifications: Record<string, unknown>[] = [];
  for (const line of sections["Certifications"] ?? []) {
    if (!line.startsWith("- ")) continue;
    const parts = line.slice(2).split("|").map(stripMd);
    certifications.push({
      name: parts[0] ?? "",
      issuer: parts[1]?.trim() ?? "",
      year: parts[2]?.trim() ?? "",
    });
  }

  const skills: Record<string, unknown>[] = [];
  for (const [category, body] of parseSubsections(sections["Skills"] ?? [])) {
    skills.push({ category: stripMd(category), items: plainBullets(body) });
  }

  const coverageFields = parseFields(sections["Coverage"] ?? []);
  const coverageSub = Object.fromEntries(parseSubsections(sections["Coverage"] ?? []));
  const coveragePercentRaw = Number(coverageFields.coverage_percent ?? 0);
  const coveragePercent = Number.isFinite(coveragePercentRaw) ? Math.trunc(coveragePercentRaw) : 0;
  const guardFields = parseFields(sections["Guardrails"] ?? []);
  const guardSub = Object.fromEntries(parseSubsections(sections["Guardrails"] ?? []));

  return {
    metadata,
    contact,
    sections: {
      summary: freeText(sections["Professional Summary"] ?? []),
      competencies: plainBullets(sections["Core Competencies"] ?? []).map(stripMd),
      experience,
      projects,
      education,
      certifications,
      skills,
    },
    coverage: {
      keywords: plainBullets(coverageSub["Keywords"] ?? []).map(stripMd),
      used_keywords: plainBullets(coverageSub["Used Keywords"] ?? []).map(stripMd),
      coverage_percent: Math.max(0, Math.min(100, coveragePercent)),
    },
    guardrails: {
      risk_level: guardFields.risk_level ?? "medium",
      do_not_claim: plainBullets(guardSub["Do Not Claim"] ?? []),
      source_files: plainBullets(guardSub["Source Files"] ?? []),
    },
  };
}

export function loadReadyFile(filepath: string, stage: string): Record<string, unknown> | null {
  const ext = path.extname(filepath).toLowerCase();
  if (ext === ".json") return readJson(filepath, stage);
  if (ext === ".md") {
    try {
      return readyFromMarkdown(fs.readFileSync(filepath, "utf8"));
    } catch (e) {
      process.stderr.write(`${stage}: cannot read ${path.basename(filepath)} (${(e as Error).message})\n`);
      return null;
    }
  }
  return null;
}

export function preferMarkdown(files: string[]): string[] {
  const chosen = new Map<string, string>();
  for (const filepath of [...files].sort()) {
    const key = filepath.replace(/\.[^.]+$/, "");
    const existing = chosen.get(key);
    if (!existing || path.extname(filepath).toLowerCase() === ".md") chosen.set(key, filepath);
  }
  return [...chosen.values()];
}
