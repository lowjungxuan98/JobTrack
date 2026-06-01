import path from "node:path";
import { appendFailureForPath } from "./error-log";
import { jsonFiles, mirroredOutput, writeJson } from "./files";
import { llmJson } from "./llm";
import { log } from "./logging";
import { render } from "./prompt";
import { runParallel, safeReadJson } from "./stage-utils";

export interface JsonStageOptions {
  argv?: string[];
  stage: string;
  inDir: string;
  outDir: string;
  emptyLabel: string;
  failureLabel: string;
  template: string | (() => string | null);
  chat: (prompt: string) => Promise<string>;
  promptValues: (job: Record<string, unknown>, filepath: string) => Record<string, unknown>;
  buildRecord: (
    job: Record<string, unknown>,
    llm: Record<string, unknown>,
    filepath: string,
  ) => Record<string, unknown>;
  label?: (job: Record<string, unknown>, filepath: string) => string;
  doneLabel?: string;
}

export async function runJsonStage({
  argv = [],
  stage,
  inDir,
  outDir,
  emptyLabel,
  failureLabel,
  template,
  chat,
  promptValues,
  buildRecord,
  label = (job) => `${job.company} - ${job.job_title ?? job.title}`,
  doneLabel = "records",
}: JsonStageOptions): Promise<number> {
  const files = jsonFiles(argv, inDir, stage, emptyLabel);
  if (!files) return 1;
  if (!files.length) return 0;

  const promptTemplate = typeof template === "function" ? template() : template;
  if (promptTemplate == null) return 1;

  const written = await runParallel(stage, files, async (filepath) => {
    const job = safeReadJson(filepath, stage, inDir, failureLabel);
    if (job == null) return null;
    log(stage, `start | ${label(job, filepath)}`);

    const values = promptValues(job, filepath);
    const llm = await llmJson(stage, path.basename(filepath), render(promptTemplate, values), chat);
    if (llm == null) {
      await appendFailureForPath(filepath, inDir, failureLabel);
      return null;
    }

    const outPath = mirroredOutput(filepath, inDir, outDir);
    writeJson(outPath, buildRecord(job, llm, filepath));
    log(stage, `wrote ${outPath}`);
    return outPath;
  });

  log(stage, `done - ${written}/${files.length} ${doneLabel} written to ${outDir}`);
  return 0;
}
