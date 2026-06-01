import { s } from "./values";

export function field(key: string, value: unknown): string {
  return `- **${key}:** ${s(value)}`;
}

export function bullet(value: unknown): string {
  return `- ${s(value)}`;
}

export function stripMd(value: unknown): string {
  let text = s(value);
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/`(.+?)`/g, "$1");
  text = text.replace(/\*\*/g, "");
  return text.trim();
}

export function parseSections(lines: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current = "";
  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      out[current] = [];
    } else if (current) {
      out[current].push(line);
    }
  }
  return out;
}

export function parseSubsections(lines: string[]): [string, string[]][] {
  const out: [string, string[]][] = [];
  let current = "";
  let buf: string[] = [];
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (current) out.push([current, buf]);
      current = line.slice(4).trim();
      buf = [];
    } else if (current) {
      buf.push(line);
    }
  }
  if (current) out.push([current, buf]);
  return out;
}

export function parseFields(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
    if (m) out[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return out;
}

export function plainBullets(lines: string[]): string[] {
  return lines
    .filter((line) => line.startsWith("- ") && !/^- \*\*.+?:\*\*/.test(line))
    .map((line) => line.slice(2).trim());
}

export function afterHeading(lines: string[], heading: string): string[] {
  let active = false;
  const out: string[] = [];
  for (const line of lines) {
    if (line === heading) {
      active = true;
      continue;
    }
    if (active && line.startsWith("#### ")) break;
    if (active) out.push(line);
  }
  return out;
}

export function freeText(lines: string[]): string {
  const skipped = ["- ", "### ", "#### ", "<!--"];
  return lines
    .filter((line) => line.trim() && !skipped.some((p) => line.startsWith(p)))
    .join("\n")
    .trim();
}
