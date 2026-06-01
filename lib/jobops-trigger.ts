import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { openRunLogFd } from "@/app/job-ops/lib/run-logs";
import { createRun, markRunFailed, type RunKind } from "@/app/job-ops/lib/run-tracker";

export async function triggerJobOps(kind: RunKind, args: string[] = []) {
  const runId = await createRun(kind);
  const repoRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  let logFd: number | null = null;

  try {
    logFd = openRunLogFd(runId);
    const child = spawn(
      path.join(repoRoot, "node_modules", ".bin", "tsx"),
      [path.join(repoRoot, "app", "job-ops", "main.ts"), ...args],
      {
        cwd: repoRoot,
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: { ...process.env, RUN_ID: runId },
      },
    );
    child.unref();
  } catch (e) {
    const message = (e as Error).message;
    await markRunFailed(runId, message);
    return NextResponse.json({ ok: false, run_id: runId, error: message }, { status: 500 });
  } finally {
    if (logFd != null) closeFd(logFd);
  }

  return NextResponse.json({ ok: true, run_id: runId });
}

function closeFd(fd: number): void {
  try {
    fs.closeSync(fd);
  } catch {}
}
