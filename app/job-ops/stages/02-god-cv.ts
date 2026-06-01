// Build ideal-CV strategy reports from outputs/analyze/.
import path from "node:path";
import { chatWebsearch } from "../lib/codex-client";
import { dumps } from "../lib/files";
import { runJsonStage } from "../lib/json-stage";
import { OUTPUTS_DIR } from "../lib/paths";
import { loadPromptOrLog } from "../lib/stage-utils";
import {
  DECISIONS,
  clampInt,
  decisionFor,
  safeChoice,
  strList,
} from "../lib/values";

const STAGE = "god-cv";
const IN_DIR = path.join(OUTPUTS_DIR, "analyze");
const OUT_DIR = path.join(OUTPUTS_DIR, "god-cv");

function buildRecord(job: Record<string, unknown>, llm: Record<string, unknown>): Record<string, unknown> {
  const score = clampInt(llm.apply_score);
  return {
    job_title: job.title ?? llm.job_title,
    company: job.company ?? llm.company,
    apply_score: score,
    decision: safeChoice(llm.decision, DECISIONS, decisionFor(score)),
    cv_version: llm.cv_version || "General CV",
    must_have_requirements: strList(llm.must_have_requirements),
    good_to_have_requirements: strList(llm.good_to_have_requirements),
    matched_strengths: strList(llm.matched_strengths),
    missing_or_weak_points: strList(llm.missing_or_weak_points),
    recommendation: llm.recommendation || "",
  };
}

export async function runStage(argv: string[] = []): Promise<number> {
  return runJsonStage({
    argv,
    stage: STAGE,
    inDir: IN_DIR,
    outDir: OUT_DIR,
    emptyLabel: "analyzed jobs",
    failureLabel: "02-god-cv",
    template: () => loadPromptOrLog(STAGE),
    chat: chatWebsearch,
    promptValues: (job) => ({ job_json: dumps(job) }),
    buildRecord,
    label: (job) => `${job.company} - ${job.title}`,
    doneLabel: "reports",
  });
}
