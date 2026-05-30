-- CreateTable
CREATE TABLE "job_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "job_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_role_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "job_role" TEXT NOT NULL,
    "posted_date" DATE,
    "url" TEXT NOT NULL,
    "cv" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_role_name_key" ON "job_role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "job_role_slug_key" ON "job_role"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_url_key" ON "jobs"("url");

-- CreateIndex
CREATE INDEX "idx_jobs_company" ON "jobs"("company_name");

-- CreateIndex
CREATE INDEX "idx_jobs_role" ON "jobs"("job_role_id");

-- CreateIndex
CREATE INDEX "idx_jobs_status" ON "jobs"("status");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_role_id_fkey" FOREIGN KEY ("job_role_id") REFERENCES "job_role"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
