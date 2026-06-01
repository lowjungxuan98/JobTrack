# job-ops

TypeScript port of the JobOps batch pipeline. Lives under `app/job-ops/` as
a library — there are no Next.js pages or routes (no `page.tsx`, `route.ts`,
or `layout.tsx`), so `next build` ignores this directory.

## What it does

Automates the job-application pipeline:

1. **00 collect** — scrape postings per (platform × role) via Codex web agent.
2. **01 analyze** — extract job description + requirements from each posting.
3. **02 god-cv** — score apply-fit; identify must-have vs. good-to-have.
4. **03 match-cv** — compare master CV against the requirements.
5. **04 risk-control** — assess what's safe to claim.
6. **05 ready-format** — generate tailored CV as editable Markdown.
7. **06 gen-cv** — render CV to PDF via Playwright + Chromium.
8. **07 cover-letter** — generate cover-letter JSON, HTML, PDF.
9. **08 attachment** — merge CV + cover letter + extras into one PDF.
10. **09 report** — upload PDFs to MinIO, write `report.xlsx`, ingest to Postgres.

## codewhale → codex

The original Python used `codewhale exec [--auto] --json --model X -- prompt`.
This port uses `codex exec --json --skip-git-repo-check [-m model] prompt` for
every LLM call (`lib/codex-client.ts`). `chatWebsearch()` is provided as a thin
alias for stages that fetch URLs; codex's tool access is governed by
`~/.codex/config.toml` (no per-call `--auto` flag), so prompts include URLs and
the agent fetches them via its built-in tools.

## Setup

1. Install dependencies and Chromium for Playwright:
   ```bash
   npm install
   npx playwright install chromium
   ```
2. Start infra:
   ```bash
   docker compose up -d jobops-db jobops-minio
   ```
3. Authenticate Codex (one-time):
   ```bash
   npm run codex:login
   ```

## Configuration

Edit `app/job-ops/config.yaml`. Top-level keys:

- `pipeline.batch_size` — jobs per batch (default 10).
- `codex.bin` / `codex.model` / `codex.timeout` / `codex.retries` / `codex.retry_backoff`
- `collect.*` — platforms, roles, eligibility, `target_per_role`.

Database and MinIO settings are read from the app `.env`:
`DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`,
`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, and `MINIO_BUCKET`.

## Running

```bash
npm run job-ops                          # full pipeline using assets/jobs/jobs.xlsx
npm run job-ops -- path/to/jobs.xlsx     # explicit xlsx
npm run job-ops -- retry                 # rebuild xlsx from Failed DB rows and re-run
npm run job-ops -- --from 2              # start from stage 02 per batch
npm run job-ops -- --only 3              # run only stage 03 per batch
npm run job-ops -- --batch-size 5        # override pipeline.batch_size
npm run job-ops:list                     # list discovered stages
npm run job-ops:retry                    # alias for `... retry`
```

Individual stages can also be invoked directly:

```bash
npx tsx app/job-ops/stages/06-gen-cv.ts
```

## Data flow

- All intermediate artifacts land under `outputs/<stage>/<sheet>/<job>.json`
  (or `.md` for stage 05). The directory is gitignored.
- Failures from stages 01–08 are written to `outputs/report.xlsx` immediately
  via a serialized writer.
- Stage 09 uploads merged PDFs to MinIO and upserts the full report to
  Postgres (`jobs` table, idempotent on `url`).

## Project conventions honored

- SRE roles are collected and stored under the `devops` role.
- Path alias `@/*` → project root — but this module imports relative paths to
  keep the library self-contained.
- TypeScript strict mode.
- No emojis, no comments beyond non-obvious "why" notes.
- No Next.js route files anywhere in this tree.
