// Persistent run / batch tracking for the JobOps pipeline.
//
// Reuses the pg pool from db-client.ts. All write functions swallow errors
// (log to stderr) so that a tracker DB outage cannot crash the pipeline.
// Read functions throw — the UI surfaces errors directly.
import { withClient } from "./db-client";

export type RunKind = "full" | "retry";
export type RunStatus = "running" | "success" | "failed";
export type BatchStatus = "running" | "success" | "failed";

export interface PipelineRun {
  id: string;
  kind: RunKind;
  status: RunStatus;
  total_rows: number | null;
  total_batches: number | null;
  current_batch: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface PipelineBatch {
  id: string;
  run_id: string;
  batch_index: number;
  row_start: number;
  row_end: number;
  status: BatchStatus;
  current_stage: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

let schemaReady = false;

async function ensurePipelineSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      create table if not exists pipeline_runs (
        id            uuid primary key default gen_random_uuid(),
        kind          text not null,
        status        text not null,
        total_rows    int,
        total_batches int,
        current_batch int,
        started_at    timestamptz default now(),
        finished_at   timestamptz,
        error         text
      )
    `);
    await c.query(`
      create table if not exists pipeline_batches (
        id            uuid primary key default gen_random_uuid(),
        run_id        uuid not null references pipeline_runs(id) on delete cascade,
        batch_index   int not null,
        row_start     int not null,
        row_end       int not null,
        status        text not null,
        current_stage text,
        started_at    timestamptz default now(),
        finished_at   timestamptz,
        error         text,
        unique(run_id, batch_index)
      )
    `);
    await c.query(
      "create index if not exists idx_pipeline_runs_started_at on pipeline_runs(started_at desc)",
    );
    await c.query(
      "create index if not exists idx_pipeline_batches_run on pipeline_batches(run_id)",
    );
  });
  schemaReady = true;
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    await ensurePipelineSchema();
    return await fn();
  } catch (e) {
    process.stderr.write(`[run-tracker] ${label}: ${(e as Error).message}\n`);
    return null;
  }
}

export async function createRun(kind: RunKind): Promise<string> {
  // This one throws — the API route depends on getting an id back.
  await ensurePipelineSchema();
  return withClient(async (c) => {
    const res = await c.query<{ id: string }>(
      "insert into pipeline_runs (kind, status) values ($1, 'running') returning id",
      [kind],
    );
    return res.rows[0].id;
  });
}

export async function updateRunTotals(
  id: string,
  totalRows: number,
  totalBatches: number,
): Promise<void> {
  await safe("updateRunTotals", () =>
    withClient((c) =>
      c.query(
        "update pipeline_runs set total_rows = $2, total_batches = $3 where id = $1",
        [id, totalRows, totalBatches],
      ),
    ),
  );
}

export async function setRunCurrentBatch(id: string, batchIndex: number): Promise<void> {
  await safe("setRunCurrentBatch", () =>
    withClient((c) =>
      c.query("update pipeline_runs set current_batch = $2 where id = $1", [id, batchIndex]),
    ),
  );
}

export async function markRunSuccess(id: string): Promise<void> {
  await safe("markRunSuccess", () =>
    withClient((c) =>
      c.query(
        "update pipeline_runs set status = 'success', finished_at = now() where id = $1",
        [id],
      ),
    ),
  );
}

export async function markRunFailed(id: string, error: string): Promise<void> {
  await safe("markRunFailed", () =>
    withClient((c) =>
      c.query(
        "update pipeline_runs set status = 'failed', finished_at = now(), error = $2 where id = $1",
        [id, error.slice(0, 4000)],
      ),
    ),
  );
}

export async function startBatch(
  runId: string,
  batchIndex: number,
  rowStart: number,
  rowEnd: number,
): Promise<string | null> {
  return safe("startBatch", () =>
    withClient(async (c) => {
      const res = await c.query<{ id: string }>(
        `insert into pipeline_batches (run_id, batch_index, row_start, row_end, status)
         values ($1, $2, $3, $4, 'running')
         on conflict (run_id, batch_index) do update
         set status = 'running', started_at = now(), finished_at = null, error = null,
             current_stage = null, row_start = excluded.row_start, row_end = excluded.row_end
         returning id`,
        [runId, batchIndex, rowStart, rowEnd],
      );
      return res.rows[0].id;
    }),
  );
}

export async function setBatchStage(batchId: string | null, stage: string): Promise<void> {
  if (!batchId) return;
  await safe("setBatchStage", () =>
    withClient((c) =>
      c.query("update pipeline_batches set current_stage = $2 where id = $1", [batchId, stage]),
    ),
  );
}

export async function finishBatch(
  batchId: string | null,
  status: BatchStatus,
  error?: string,
): Promise<void> {
  if (!batchId) return;
  await safe("finishBatch", () =>
    withClient((c) =>
      c.query(
        "update pipeline_batches set status = $2, finished_at = now(), error = $3 where id = $1",
        [batchId, status, error ? error.slice(0, 4000) : null],
      ),
    ),
  );
}

export async function listRecentRuns(
  opts: { active?: boolean; limit?: number } = {},
): Promise<PipelineRun[]> {
  await ensurePipelineSchema();
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20));
  return withClient(async (c) => {
    const res = await c.query<PipelineRun>(
      `select id, kind, status, total_rows, total_batches, current_batch,
              started_at, finished_at, error
         from pipeline_runs
        ${opts.active ? "where status = 'running'" : ""}
        order by started_at desc
        limit $1`,
      [limit],
    );
    return res.rows;
  });
}

export async function getRunWithBatches(
  id: string,
): Promise<{ run: PipelineRun | null; batches: PipelineBatch[] }> {
  await ensurePipelineSchema();
  return withClient(async (c) => {
    const runRes = await c.query<PipelineRun>(
      `select id, kind, status, total_rows, total_batches, current_batch,
              started_at, finished_at, error
         from pipeline_runs where id = $1`,
      [id],
    );
    const batchRes = await c.query<PipelineBatch>(
      `select id, run_id, batch_index, row_start, row_end, status, current_stage,
              started_at, finished_at, error
         from pipeline_batches where run_id = $1 order by batch_index asc`,
      [id],
    );
    return { run: runRes.rows[0] ?? null, batches: batchRes.rows };
  });
}
