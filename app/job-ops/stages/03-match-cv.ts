// Compare master CV against outputs/god-cv/ requirement reports.
import path from "node:path";
import { chat } from "../lib/codex-client";
import { dumps, requireFile } from "../lib/files";
import { runJsonStage } from "../lib/json-stage";
import { CV_MD_PATH, OUTPUTS_DIR } from "../lib/paths";
import { loadPromptOrLog } from "../lib/stage-utils";
import {
  DECISIONS,
  RISKS,
  clampInt,
  decisionFor,
  dictList,
  s,
  safeChoice,
  strList,
} from "../lib/values";

const STAGE = "match-cv";
const IN_DIR = path.join(OUTPUTS_DIR, "god-cv");
const OUT_DIR = path.join(OUTPUTS_DIR, "match-cv");
const STATUSES = new Set(["matched", "weak", "missing"]);

function matchItems(value: unknown): Record<string, unknown>[] {
  return dictList(value).map((item) => {
    const status = safeChoice(item.status, STATUSES, "missing");
    return {
      requirement: s(item.requirement),
      status,
      evidence_from_master_cv: status === "missing" ? "" : s(item.evidence_from_master_cv),
    };
  });
}

function buildRecord(job: Record<string, unknown>, llm: Record<string, unknown>): Record<string, unknown> {
  const score = clampInt(llm.overall_match_score);
  return {
    job_title: job.job_title ?? llm.job_title,
    company: job.company ?? llm.company,
    overall_match_score: score,
    decision: safeChoice(llm.decision, DECISIONS, decisionFor(score)),
    must_have_match: matchItems(llm.must_have_match),
    good_to_have_match: matchItems(llm.good_to_have_match),
    gap_summary: strList(llm.gap_summary),
    what_to_fix_in_cv: strList(llm.what_to_fix_in_cv),
    risk: safeChoice(llm.risk, RISKS, "medium"),
    recommendation: llm.recommendation || "",
  };
}

export async function runStage(argv: string[] = []): Promise<number> {
  const masterCv = requireFile(STAGE, CV_MD_PATH, "master CV");
  if (masterCv == null) return 1;
  return runJsonStage({
    argv,
    stage: STAGE,
    inDir: IN_DIR,
    outDir: OUT_DIR,
    emptyLabel: "god-cv reports",
    failureLabel: "03-match-cv",
    template: () => loadPromptOrLog(STAGE),
    chat,
    promptValues: (job) => ({ master_cv: masterCv, job_json: dumps(job) }),
    buildRecord,
    doneLabel: "reports",
  });
}
