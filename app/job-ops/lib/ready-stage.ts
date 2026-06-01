import { filesWithSuffixes } from "./files";
import { log } from "./logging";
import { runParallel } from "./stage-utils";
import { preferMarkdown } from "./ready-markdown";

const READY_SUFFIXES = new Set([".md", ".json"]);

export async function runReadyStage(
  stage: string,
  argv: string[],
  inDir: string,
  emptyLabel: string,
  outDir: string,
  doneLabel: string,
  worker: (filepath: string) => Promise<unknown>,
): Promise<number> {
  let files = filesWithSuffixes(argv, inDir, stage, emptyLabel, READY_SUFFIXES);
  if (!files) return 1;
  if (!files.length) return 0;
  files = preferMarkdown(files);
  const written = await runParallel(stage, files, worker);
  log(stage, `done - ${written}/${files.length} ${doneLabel} written to ${outDir}`);
  return written ? 0 : 1;
}
