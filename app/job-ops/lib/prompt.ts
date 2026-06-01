import fs from "node:fs";
import path from "node:path";
import { PROMPTS_DIR } from "./paths";

export function promptPath(name: string): string {
  const filename = name.endsWith(".txt") ? name : `${name}.txt`;
  return path.join(PROMPTS_DIR, filename);
}

export function loadPrompt(name: string): string {
  const p = promptPath(name);
  if (!fs.existsSync(p)) {
    throw new Error(`prompt template not found: ${p}`);
  }
  return fs.readFileSync(p, "utf8");
}

export function render(template: string, values: Record<string, unknown>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    const replacement = value == null ? "" : String(value);
    out = out.split("{{" + key + "}}").join(replacement);
  }
  return out;
}
