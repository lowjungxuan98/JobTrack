export const DECISIONS = new Set(["Apply", "Maybe", "Skip"]);
export const RISKS = new Set(["low", "medium", "high"]);

export function s(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

export function firstStr(item: unknown, ...keys: string[]): string {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const obj = item as Record<string, unknown>;
  for (const key of keys) {
    const v = s(obj[key]);
    if (v) return v;
  }
  return "";
}

export function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(s).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function dictList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
}

export function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function clampInt(value: unknown, def = 0, lo = 0, hi = 100): number {
  const n = Number(value);
  const num = Number.isFinite(n) ? Math.trunc(n) : def;
  return Math.max(lo, Math.min(hi, num));
}

export function decisionFor(score: number): string {
  if (score >= 75) return "Apply";
  if (score >= 50) return "Maybe";
  return "Skip";
}

export function safeChoice(value: unknown, allowed: Set<string>, def: string): string {
  const text = s(value);
  return allowed.has(text) ? text : def;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
