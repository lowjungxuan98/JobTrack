import { NextResponse } from "next/server";
import { loginStatus, runCodex } from "@/lib/codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DoctorDetails = { [k: string]: string };
type DoctorCheck = { id: string; status: string; details?: DoctorDetails };
type DoctorReport = { codexVersion?: string; checks?: Record<string, DoctorCheck> };

interface AccountSummary {
  mode: string | null;          // 'chatgpt' | 'api-key' | …
  model: string | null;
  version: string | null;
  remaining: string | null;     // codex CLI does not expose this today
}

function parseDoctor(stdout: string): AccountSummary | null {
  try {
    const report = JSON.parse(stdout) as DoctorReport;
    const auth = report.checks?.["auth.credentials"]?.details ?? {};
    const config = report.checks?.["config.load"]?.details ?? {};
    return {
      mode: auth["stored auth mode"] ?? null,
      model: config["model"] ?? null,
      version: report.codexVersion ?? null,
      remaining: null,
    };
  } catch {
    return null;
  }
}

// GET /api/codex/status — login state + best-effort account summary.
// `usage` is reserved for when codex CLI begins exposing remaining quota;
// today the value is always null but other account fields (mode, model,
// version) are populated from `codex doctor --json`.
export async function GET() {
  const base = loginStatus(await runCodex(["login", "status"]));
  let usage: AccountSummary | null = null;
  try {
    const doc = await runCodex(["doctor", "--json"], 8_000);
    if (doc.exitCode === 0 || doc.stdout.trim().startsWith("{")) {
      usage = parseDoctor(doc.stdout);
    }
  } catch {
    // best-effort: never fail the endpoint because of doctor
  }
  return NextResponse.json({ ...base, usage });
}
