// Create risk-control strategy reports from outputs/match-cv/.
import path from "node:path";
import { chat } from "../lib/codex-client";
import { dumps, requireFile } from "../lib/files";
import { runJsonStage } from "../lib/json-stage";
import { CV_MD_PATH, OUTPUTS_DIR } from "../lib/paths";
import { loadPromptOrLog } from "../lib/stage-utils";
import {
  RISKS,
  safeChoice,
  strList,
} from "../lib/values";

const STAGE = "risk-control";
const IN_DIR = path.join(OUTPUTS_DIR, "match-cv");
const OUT_DIR = path.join(OUTPUTS_DIR, "risk-control");

function buildRecord(job: Record<string, unknown>, llm: Record<string, unknown>): Record<string, unknown> {
  return {
    risk_level: safeChoice(llm.risk_level, RISKS, safeChoice(job.risk, RISKS, "medium")),
    safe_to_enhance: strList(llm.safe_to_enhance),
    do_not_claim: strList(llm.do_not_claim),
    cv_strategy: strList(llm.cv_strategy),
    candidate_success_action: llm.candidate_success_action || "",
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
    emptyLabel: "match reports",
    failureLabel: "04-risk-control",
    template: () => loadPromptOrLog(STAGE),
    chat,
    promptValues: (job) => ({ master_cv: masterCv, job_json: dumps(job) }),
    buildRecord,
    doneLabel: "reports",
  });
}
