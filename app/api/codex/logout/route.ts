import { NextResponse } from "next/server";
import { runCodex, stripAnsi } from "@/lib/codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const r = await runCodex(["logout"]);
  return NextResponse.json({
    ok: r.exitCode === 0,
    exitCode: r.exitCode,
    output: stripAnsi(r.stdout + r.stderr).trim(),
  });
}
