-- Rename pipeline status column (idempotent: skip if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'status'
  ) THEN
    ALTER TABLE "jobs" RENAME COLUMN "status" TO "pipeline_status";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_jobs_status') THEN
    ALTER INDEX "idx_jobs_status" RENAME TO "idx_jobs_pipeline_status";
  END IF;
END $$;

-- New jobs_status enum + column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jobs_status') THEN
    CREATE TYPE "jobs_status" AS ENUM ('Pending Apply', 'Applied', 'In Progress', 'Rejected');
  END IF;
END $$;

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "jobs_status" "jobs_status" NOT NULL DEFAULT 'Pending Apply';

CREATE INDEX IF NOT EXISTS "idx_jobs_jobs_status" ON "jobs"("jobs_status");
