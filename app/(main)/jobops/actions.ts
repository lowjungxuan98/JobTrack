"use server";

import { readRunLogTail } from "@/app/job-ops/lib/run-logs";
import {
  getRunWithBatches,
  listRecentRuns,
  type PipelineBatch,
  type PipelineRun,
} from "@/app/job-ops/lib/run-tracker";

export type RunSummary = PipelineRun;
export type BatchSummary = PipelineBatch;

export async function fetchRecentRuns(active?: boolean): Promise<RunSummary[]> {
  return listRecentRuns({ active, limit: 20 });
}

export async function fetchRunDetail(
  id: string,
): Promise<{ run: RunSummary | null; batches: BatchSummary[] }> {
  return getRunWithBatches(id);
}

export async function fetchRunLog(id: string, maxBytes = 200_000): Promise<string> {
  return readRunLogTail(id, maxBytes);
}
