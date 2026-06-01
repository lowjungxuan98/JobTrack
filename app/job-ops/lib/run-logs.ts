import fs from "node:fs";
import path from "node:path";
import { OUTPUTS_DIR } from "./paths";

export const RUN_LOGS_DIR = path.join(OUTPUTS_DIR, ".logs");

export function logPathFor(runId: string): string {
  return path.join(RUN_LOGS_DIR, `${runId}.log`);
}

export function openRunLogFd(runId: string): number {
  fs.mkdirSync(RUN_LOGS_DIR, { recursive: true });
  return fs.openSync(logPathFor(runId), "a");
}

// Read the tail of a run's log file. Returns up to `maxBytes` from the end.
// Missing file → empty string (run may not have started writing yet).
export function readRunLogTail(runId: string, maxBytes = 200_000): string {
  const p = logPathFor(runId);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(p);
  } catch {
    return "";
  }
  if (stat.size === 0) return "";
  const size = Math.min(stat.size, maxBytes);
  const start = stat.size - size;
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, start);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}
