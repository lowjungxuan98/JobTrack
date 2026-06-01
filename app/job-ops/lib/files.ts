import fs from "node:fs";
import path from "node:path";
import { log } from "./logging";
import { repoPath } from "./paths";

function* walkFiles(dir: string, suffixes: Set<string>): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full, suffixes);
    else if (entry.isFile() && suffixes.has(path.extname(full).toLowerCase())) yield full;
  }
}

export function filesWithSuffixes(
  argv: string[],
  inDir: string,
  stage: string,
  emptyLabel: string,
  suffixes: Set<string>,
): string[] | null {
  let files: string[];
  if (argv.length) {
    files = argv.map(repoPath);
  } else {
    if (!fs.existsSync(inDir) || !fs.statSync(inDir).isDirectory()) {
      log(stage, `input dir not found: ${inDir}`);
      return null;
    }
    files = [...walkFiles(inDir, suffixes)].sort();
  }
  files = files.filter((f) => fs.existsSync(f) && fs.statSync(f).isFile() && suffixes.has(path.extname(f).toLowerCase()));
  if (!files.length) log(stage, `no ${emptyLabel} found in ${inDir}`);
  return files;
}

export function jsonFiles(argv: string[], inDir: string, stage: string, emptyLabel: string): string[] | null {
  return filesWithSuffixes(argv, inDir, stage, emptyLabel, new Set([".json"]));
}

export function relativeToDir(p: string, inDir: string): string {
  const rel = path.relative(path.resolve(inDir), path.resolve(p));
  return rel.startsWith("..") || path.isAbsolute(rel) ? path.basename(p) : rel;
}

export function mirroredOutput(p: string, inDir: string, outDir: string): string {
  return path.join(outDir, relativeToDir(p, inDir));
}

export function readJson(filepath: string, stage: string): Record<string, unknown> | null {
  if (!fs.existsSync(filepath) || !fs.statSync(filepath).isFile()) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filepath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch (e) {
    log(stage, `cannot read ${path.basename(filepath)} (${(e as Error).message})`);
    return null;
  }
}

export function writeJson(filepath: string, data: unknown): string {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data ?? {}, null, 2) + "\n", "utf8");
  return filepath;
}

export function requireFile(stage: string, filepath: string, label: string): string | null {
  if (!fs.existsSync(filepath) || !fs.statSync(filepath).isFile()) {
    log(stage, `${label} not found: ${filepath}`);
    return null;
  }
  return fs.readFileSync(filepath, "utf8");
}

export function dumps(data: unknown): string {
  return JSON.stringify(data ?? {}, null, 2);
}
