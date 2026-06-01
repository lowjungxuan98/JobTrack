-- JobOps database schema

create extension if not exists pgcrypto;

do $$
begin
    if not exists (select 1 from pg_type where typname = 'jobs_status') then
        create type jobs_status as enum ('Pending Apply', 'Applied', 'In Progress', 'Rejected');
    end if;
end $$;

create table if not exists job_role (
    id      uuid primary key default gen_random_uuid(),
    name    text unique not null,       -- e.g. "mobile", "devops"
    slug    text unique not null        -- e.g. "mobile", "devops"
);

create table if not exists jobs (
    id              uuid primary key default gen_random_uuid(),
    job_role_id     uuid not null references job_role(id) on delete cascade,
    company_name    text not null,
    job_role        text not null,       -- job title from the posting
    posted_date     date,
    url             text unique not null,
    cv              text,
    pipeline_status text not null,       -- "Success" or "Failed"
    jobs_status     jobs_status not null default 'Pending Apply',
    created_at      timestamptz default now()
);

create index if not exists idx_jobs_role on jobs(job_role_id);
create index if not exists idx_jobs_company on jobs(company_name);
create index if not exists idx_jobs_pipeline_status on jobs(pipeline_status);
create index if not exists idx_jobs_jobs_status on jobs(jobs_status);

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
);

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
);

create index if not exists idx_pipeline_runs_started_at on pipeline_runs(started_at desc);
create index if not exists idx_pipeline_batches_run on pipeline_batches(run_id);
