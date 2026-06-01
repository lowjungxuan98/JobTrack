// Postgres client used by the pipeline.
//
// Only steps 00-collect (dedup lookup) and 09-report (final ingestion)
// touch the database; all other stages stay file-based.
import { Pool, PoolClient } from "pg";
import { parse as parseUrl } from "node:url";
import { cfg, cfgString } from "./config";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = cfgString("database.url");
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for JobOps database access");
    }
    pool = new Pool({
      connectionString,
      max: 10,
    });
  }
  return pool;
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function slugifyDb(name: string): string {
  return normalizeRoleSlug(String(name).replace(/[\s_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase());
}

export function normalizeRoleSlug(slug: string): string {
  return slug === "sre" ? "devops" : slug;
}

export function normalizeCvKey(value: unknown): string {
  const text = (value == null ? "" : String(value)).trim();
  if (!text) return "";
  try {
    const u = parseUrl(text);
    if (u.protocol && u.host) {
      const bucket = String(cfg("minio.bucket") || "").replace(/^\/|\/$/g, "");
      let p = (u.pathname || "").replace(/^\/+/, "");
      const prefix = bucket ? `${bucket}/` : "";
      if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length);
      return decodeURIComponent(p);
    }
  } catch {}
  return text;
}

export async function fetchKnownUrls(): Promise<Set<string>> {
  try {
    return await withClient(async (c) => {
      const res = await c.query<{ url: string }>("select url from jobs");
      return new Set(res.rows.map((r) => r.url).filter(Boolean));
    });
  } catch (e) {
    process.stderr.write(`[db] fetchKnownUrls: ${(e as Error).message}; proceeding with empty set\n`);
    return new Set();
  }
}

export interface FailedJobRow {
  job_title: string | null;
  company: string | null;
  location: string;
  url: string | null;
  posted_date: string | Date | null;
}

export async function fetchFailedJobsByRole(): Promise<Record<string, FailedJobRow[]>> {
  return withClient(async (c) => {
    const res = await c.query<{
      name: string;
      slug: string;
      job_role: string | null;
      company_name: string | null;
      posted_date: Date | null;
      url: string | null;
    }>(
      `select r.name, r.slug, j.job_role, j.company_name, j.posted_date, j.url
       from jobs j
       join job_role r on r.id = j.job_role_id
       where lower(j.pipeline_status) like 'failed%'
       order by r.name, j.company_name, j.job_role, j.url`,
    );
    const out: Record<string, FailedJobRow[]> = {};
    for (const row of res.rows) {
      const sheet = row.name || row.slug || "retry";
      (out[sheet] ??= []).push({
        job_title: row.job_role,
        company: row.company_name,
        location: "",
        url: row.url,
        posted_date: row.posted_date,
      });
    }
    return out;
  });
}

export async function upsertRole(c: PoolClient, name: string, slug: string): Promise<string> {
  const normalizedSlug = normalizeRoleSlug(slug);
  const normalizedName = normalizedSlug === "devops" && normalizeRoleSlug(name.toLowerCase()) === "devops"
    ? "devops"
    : name;
  const res = await c.query<{ id: string }>(
    `insert into job_role (name, slug) values ($1, $2)
     on conflict (slug) do update set name = excluded.name returning id`,
    [normalizedName, normalizedSlug],
  );
  return res.rows[0].id;
}

function coerceDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  const str = String(value).slice(0, 10);
  const d = new Date(str);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function upsertJob(
  c: PoolClient,
  roleId: string,
  company: unknown,
  title: unknown,
  postedDate: unknown,
  url: string,
  pipelineStatus: unknown,
  cv: unknown = "",
): Promise<void> {
  await c.query(
    `insert into jobs (job_role_id, company_name, job_role, posted_date, url, pipeline_status, cv)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (url) do update
     set job_role_id = excluded.job_role_id,
         company_name = excluded.company_name,
         job_role = excluded.job_role,
         posted_date = excluded.posted_date,
         pipeline_status = excluded.pipeline_status,
         cv = coalesce(nullif(excluded.cv, ''), jobs.cv)`,
    [
      roleId,
      String(company ?? ""),
      String(title ?? ""),
      coerceDate(postedDate),
      url,
      String(pipelineStatus ?? ""),
      normalizeCvKey(cv),
    ],
  );
}
