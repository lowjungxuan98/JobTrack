// Render ready-format CV payloads into template HTML.
import { dictList, firstStr, recordOf, s, strList } from "./values";

const UNRESOLVED_RE = /\{\{[A-Z_]+\}\}/g;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function h(value: unknown): string {
  return s(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function rich(value: unknown): string {
  return h(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function href(value: unknown): string {
  let url = s(value);
  if (!url) return "";
  if (!url.includes("://") && !url.startsWith("mailto:")) url = `https://${url}`;
  return url.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function textBlock(value: unknown): string {
  const text = s(value);
  if (!text) return "";
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return rich(text).replace(/\n/g, "<br>");
  return parts.map((p) => `<p>${rich(p).replace(/\n/g, "<br>")}</p>`).join("");
}

export function renderContact(contact: Record<string, unknown>): string {
  const items: string[] = [];
  if (s(contact.phone)) items.push(`<span>${h(contact.phone)}</span>`);
  if (s(contact.email)) items.push(`<a href="mailto:${h(contact.email)}">${h(contact.email)}</a>`);
  for (const [urlKey, displayKey] of [
    ["linkedin_url", "linkedin_display"],
    ["portfolio_url", "portfolio_display"],
  ] as const) {
    const url = s(contact[urlKey]);
    const display = s(contact[displayKey]) || s(contact[urlKey]);
    if (url && display) items.push(`<a href="${href(url)}">${h(display)}</a>`);
  }
  if (s(contact.location)) items.push(`<span>${h(contact.location)}</span>`);
  return items.join('\n      <span class="separator">|</span>\n      ');
}

export function bullets(items: unknown): string {
  const values = strList(items);
  if (!values.length) return "";
  return "<ul>\n" + values.map((item) => `      <li>${rich(item)}</li>`).join("\n") + "\n    </ul>";
}

export function competencies(items: unknown): string {
  return strList(items)
    .map((item) => `<span class="competency-tag">${rich(item)}</span>`)
    .join("\n      ");
}

export function experience(items: unknown): string {
  return dictList(items)
    .map((item) => {
      const location = h(item.location);
      const locationHtml = location ? ` <span class="job-location">${location}</span>` : "";
      return `<div class="job avoid-break">
  <div class="job-header">
    <div><span class="job-company">${h(item.company)}</span>${locationHtml}</div>
    <div class="job-period">${h(item.period)}</div>
  </div>
  <div class="job-role">${h(item.role)}</div>
  ${bullets(item.bullets)}
</div>`;
    })
    .join("\n");
}

export function projects(items: unknown): string {
  return dictList(items)
    .map((item) => {
      const badge = h(item.badge);
      const badgeHtml = badge ? `<span class="project-badge">${badge}</span>` : "";
      const desc = textBlock(item.description);
      const descHtml = desc ? `<div class="project-desc">${desc}</div>` : "";
      const tech = h(firstStr(item, "tech", "technologies"));
      const techHtml = tech ? `<div class="project-tech">${tech}</div>` : "";
      return `<div class="project avoid-break">
  <div class="project-title">${h(firstStr(item, "name", "title"))}${badgeHtml}</div>
  ${descHtml}
  ${bullets(item.bullets)}
  ${techHtml}
</div>`;
    })
    .join("\n");
}

export function education(items: unknown): string {
  return dictList(items)
    .map((item) => {
      const degree = h(firstStr(item, "degree", "title"));
      const school = h(firstStr(item, "school", "institution", "org"));
      const title =
        degree && school
          ? `${degree}<br><span class="edu-org">${school}</span>`
          : degree || `<span class="edu-org">${school}</span>`;
      const details = textBlock(firstStr(item, "details", "description"));
      const detailsHtml = details ? `<div class="edu-desc">${details}</div>` : "";
      return `<div class="edu-item avoid-break">
  <div class="edu-header">
    <div class="edu-title">${title}</div>
    <div class="edu-year">${h(firstStr(item, "period", "year"))}</div>
  </div>
  ${detailsHtml}
</div>`;
    })
    .join("\n");
}

export function certifications(items: unknown): string {
  return dictList(items)
    .map(
      (item) => `<div class="cert-item avoid-break">
  <div class="cert-title">${h(firstStr(item, "name", "title"))}</div>
  <div class="cert-org">${h(firstStr(item, "issuer", "org"))}</div>
  <div class="cert-year">${h(firstStr(item, "year", "issued"))}</div>
</div>`,
    )
    .join("\n");
}

export function skills(items: unknown): string {
  let list: unknown[] = [];
  if (items && typeof items === "object" && !Array.isArray(items)) {
    list = Object.entries(recordOf(items)).map(([key, value]) => ({
      category: key,
      items: value,
    }));
  } else if (Array.isArray(items)) {
    list = items;
  }
  const rows: string[] = [];
  for (const item of dictList(list)) {
    const values = strList(item.items ?? item.skills).map(h).join(", ");
    const category = firstStr(item, "category", "name");
    if (category || values) {
      rows.push(`<div class="skill-item"><span class="skill-category">${h(category)}:</span> ${values}</div>`);
    }
  }
  return rows.length ? `<div class="skills-grid">\n  ${rows.join("\n  ")}\n</div>` : "";
}

export function renderHtml(data: Record<string, unknown>, template: string): string {
  const metadata = recordOf(data.metadata);
  const contact = recordOf(data.contact);
  const sections = recordOf(data.sections);
  const paperFormat = s(metadata.paper_format).toLowerCase();
  const replacements: Record<string, string> = {
    LANG: s(metadata.language) || "en",
    PAGE_CLASS: paperFormat === "letter" ? "page-letter" : "page-a4",
    NAME: h(contact.name || "Candidate"),
    CONTACT_ROW: renderContact(contact),
    SECTION_SUMMARY: "Professional Summary",
    SUMMARY_TEXT: textBlock(sections.summary),
    SECTION_COMPETENCIES: "Core Competencies",
    COMPETENCIES: competencies(sections.competencies),
    SECTION_EXPERIENCE: "Work Experience",
    EXPERIENCE: experience(sections.experience),
    SECTION_PROJECTS: "Projects",
    PROJECTS: projects(sections.projects),
    SECTION_EDUCATION: "Education",
    EDUCATION: education(sections.education),
    SECTION_CERTIFICATIONS: "Certifications",
    CERTIFICATIONS: certifications(sections.certifications),
    SECTION_SKILLS: "Skills",
    SKILLS: skills(sections.skills),
  };
  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  const unresolved = [...new Set(html.match(UNRESOLVED_RE) ?? [])].sort();
  if (unresolved.length) {
    throw new Error(`unresolved template placeholders: ${unresolved.join(", ")}`);
  }
  return html;
}
