import "dotenv/config";
import fs from "node:fs";
import yaml from "js-yaml";
import { CONFIG_PATH } from "./paths";

const DEFAULTS: Record<string, unknown> = {
  "pipeline.batch_size": 10,
  "codex.bin": "codex",
  "codex.model": "",
  "codex.timeout": 600,
  "codex.retries": 3,
  "codex.retry_backoff": 4.0,
  "minio.endpoint": "localhost",
  "minio.port": 9000,
  "minio.bucket": "jobops-pdfs",
  "minio.secure": "false",
};

const ENV_KEYS: Record<string, string> = {
  "database.url": "DATABASE_URL",
  "minio.endpoint": "MINIO_ENDPOINT",
  "minio.port": "MINIO_PORT",
  "minio.access_key": "MINIO_ACCESS_KEY",
  "minio.secret_key": "MINIO_SECRET_KEY",
  "minio.bucket": "MINIO_BUCKET",
  "minio.secure": "MINIO_USE_SSL",
};

function loadConfig(): Record<string, unknown> {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`config not found: ${CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const data = yaml.load(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`config root must be a mapping, got ${typeof data}`);
  }
  return data as Record<string, unknown>;
}

export const CONFIG: Record<string, unknown> = loadConfig();

export function cfg<T = unknown>(key: string): T {
  const envKey = ENV_KEYS[key];
  if (envKey && process.env[envKey] != null && process.env[envKey] !== "") {
    return process.env[envKey] as T;
  }

  let node: unknown = CONFIG;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || Array.isArray(node) || !(part in node)) {
      return DEFAULTS[key] as T;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node as T;
}

export function cfgString(key: string, fallback = ""): string {
  const v = cfg(key);
  return v == null ? fallback : String(v);
}

export function cfgInt(key: string, fallback = 0): number {
  const v = cfg(key);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function cfgNumber(key: string, fallback = 0): number {
  const v = cfg(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function cfgBool(key: string): boolean {
  const v = cfg(key);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
  return Boolean(v);
}
