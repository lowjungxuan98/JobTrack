import pLimit from "p-limit";
import { appendFailureForPath } from "./error-log";
import { cfgInt } from "./config";
import { readJson } from "./files";
import { log } from "./logging";
import { loadPrompt } from "./prompt";
import { recordOf, s } from "./values";

export function parallelism(): number {
  return Math.max(1, cfgInt("pipeline.batch_size", 10));
}

export async function runParallel<T>(
  stage: string,
  items: T[],
  worker: (item: T) => Promise<unknown>,
): Promise<number> {
  const workers = parallelism();
  const total = items.length;
  log(stage, `${total} jobs, parallelism=${workers}`);
  let done = 0;
  let ok = 0;
  let fail = 0;
  const started = Date.now();
  let lastLog = started;
  const limit = pLimit(workers);
  const tasks = items.map((item) =>
    limit(async () => {
      try {
        const result = await worker(item);
        if (result != null) ok++;
        else fail++;
      } catch (e) {
        fail++;
        log(stage, `worker raised ${(e as Error).name ?? "Error"}: ${(e as Error).message}`);
      } finally {
        done++;
        const now = Date.now();
        if (done === total || now - lastLog >= 3000) {
          log(stage, `[${done}/${total}] ok=${ok} fail=${fail} elapsed=${((now - started) / 1000).toFixed(1)}s`);
          lastLog = now;
        }
      }
    }),
  );
  await Promise.all(tasks);
  log(stage, `stage done in ${((Date.now() - started) / 1000).toFixed(1)}s (${ok}/${total} ok)`);
  return ok;
}

export function loadPromptOrLog(stage: string): string | null {
  try {
    return loadPrompt(stage);
  } catch (e) {
    log(stage, (e as Error).message);
    return null;
  }
}

export function safeReadJson(
  filepath: string,
  stage: string,
  inDir: string,
  label: string,
): Record<string, unknown> | null {
  const data = readJson(filepath, stage);
  if (data == null) appendFailureForPath(filepath, inDir, label);
  return data;
}

export function metadataOf(data: Record<string, unknown>): Record<string, unknown> {
  return recordOf(data.metadata);
}

export function paperFormatOf(metadata: Record<string, unknown>): string {
  const fmt = s(metadata.paper_format).toLowerCase();
  return fmt === "a4" || fmt === "letter" ? fmt : "a4";
}

export function logStartFor(stage: string, metadata: Record<string, unknown>): void {
  log(stage, `start | ${metadata.company} - ${metadata.job_title}`);
}
