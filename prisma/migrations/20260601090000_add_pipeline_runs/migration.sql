-- Add JobOps run-tracking tables.
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "total_rows" INTEGER,
  "total_batches" INTEGER,
  "current_batch" INTEGER,
  "started_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  "error" TEXT,

  CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pipeline_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "batch_index" INTEGER NOT NULL,
  "row_start" INTEGER NOT NULL,
  "row_end" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "current_stage" TEXT,
  "started_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  "error" TEXT,

  CONSTRAINT "pipeline_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pipeline_batches_run_id_batch_index_key"
  ON "pipeline_batches"("run_id", "batch_index");

CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_started_at"
  ON "pipeline_runs"("started_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_pipeline_batches_run"
  ON "pipeline_batches"("run_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_batches_run_id_fkey'
  ) THEN
    ALTER TABLE "pipeline_batches"
      ADD CONSTRAINT "pipeline_batches_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "pipeline_runs"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
